const http = require('http');
const https = require('https');
const debug = require('debug')('minecrafthydra');
const path = require('path');
const extend = require('extend');
const express = require('express');
const favicon = require('serve-favicon');
const cookieParser = require('cookie-parser');
const packagejson = require('./package.json');
const version = packagejson.version;
const uuidv4 = require('uuid/v4');
const Deferred = require('node-promise').defer;
const moment = require('moment');
const fs = require('fs');
const { exec } = require("child_process");


var defaultOptions = {
    //loaded from the config file
    //var port = process.env.PORT || 1337;
    configFilePath : "config/config.json",
    useHttps : false,
    useHttp : true,
    httpsport: 443,
    httpport: 80
};


//Add a set localDebug=true  to console window to use alternative config file
if (process.env.localDebug === 'true') {
    defaultOptions.configFilePath = "config/localDebug/config.json"
}


var configFileSettings = {};
try {
    var strConfig = fs.readFileSync(path.join(__dirname, defaultOptions.configFilePath));
    configFileSettings = JSON.parse(strConfig);
} catch (ex) {
    //This needs to stay Console.log as writetolog will not function as no config
    try {
        console.log("error", "Error Reading Config File", ex);
        //if we Can't read the config its a new config or a broken config so we create it using the defaults
        fs.writeFileSync(path.join(__dirname, defaultOptions.configFilePath), JSON.stringify(defaultConfig, null, 2));
    } catch (ex) {
        console.log("error", "Error Creating New Config File just using defaults", ex);
    }
}

var objOptions = extend({}, defaultOptions, configFileSettings);


var commonData = {
    startupStats: {
        startupDate: new Date(),
        nodeVersion: process.version,
        nodeVersions: process.versions,
        platform: process.platform,
        arch: process.arch,
    },
   
    activeStreams: {}
};

var privateData = {
    logs: [],
    browserSockets: {}
};


var getConnectionInfo = function (req) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (ip.substr(0, 7) === "::ffff:") {
        ip = ip.substr(7);
    }
    var port = req.connection.remotePort;
    var ua = req.headers['user-agent'];
    return { ip: ip, port: port, ua: ua };
};


var getSocketInfo = function (socket) {
    var ip = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress;
    if (ip.substr(0, 7) === "::ffff:") {
        ip = ip.substr(7);
    }

    return { ip: ip };
};

var isObject = function (a) {
    return (!!a) && (a.constructor === Object);
};

var isArray = function (a) {
    return (!!a) && (a.constructor === Array);
};

var arrayPrint = function (obj) {
    var retval = '';
    var i;
    for (i = 0; i < obj.length; i++) {
        if (retval.length > 0) {
            retval = retval + ', ';
        }
        retval = retval + objPrint(obj[i]);
    }

    return retval;
};

var objPrint = function (obj) {
    if (obj === null) {
        return 'null';
    } else if (obj === undefined) {
        return 'undefined';
    }else if (isArray(obj)) {
            return arrayPrint(obj);
    } else if (isObject(obj)) {
        return JSON.stringify(obj);
    } else {
        return obj.toString();
    }
};

var logLevels = {
    'quiet': -8, //Show nothing at all; be silent.
    'panic': 0, //Only show fatal errors which could lead the process to crash, such as an assertion failure.This is not currently used for anything.
    'fatal': 8, //Only show fatal errors.These are errors after which the process absolutely cannot continue.
    'error': 16, //Show all errors, including ones which can be recovered from.
    'warning': 24, //Show all warnings and errors.Any message related to possibly incorrect or unexpected events will be shown.
    'info': 32, //Show informative messages during processing.This is in addition to warnings and errors.This is the default value.
    'verbose': 40,  //Same as info, except more verbose.
    'debug': 48, //Show everything, including debugging information.
    'trace': 56
};


var writeToLog = function (logLevel) {
    try {
        if (shouldLog(logLevel, objOptions.logLevel) === true) {
            var logData = { timestamp: new Date(), logLevel: logLevel, args: arguments };
            //add to the top of the 
            privateData.logs.push(logData);

            if (privateData.logs.length > objOptions.maxLogLength) {
                privateData.logs.shift();
            }

            debug(arrayPrint(arguments));
            //debug(arguments[0], arguments[1]);  // attempt to make a one line log entry
            //if (objOptions.loglevel === 'trace') {
            //    console.log(arguments);
            //}
        }
        if (io && privateData.browserSockets) {
            for (const item of Object.values(privateData.browserSockets)) {
                if (shouldLog(logLevel, item.logLevel)) {
                    item.socket.emit("streamerLog", logData);
                }
            }
        }
    } catch (ex) {
        debug('error', 'Error WriteToLog', ex);
    }
};

var getLogLevel = function (logLevelName) {

    if (logLevels[logLevelName]) {
        return logLevels[logLevelName];
    } else {
        return 100;
    }
};



var shouldLog = function (logLevelName, logLevel) {

    if (getLogLevel(logLevelName) <= getLogLevel(logLevel)) {
        return true;
    } else {
        return false;
    }
};


var app = express();

app.use(express.static(path.join(__dirname, 'public')));

// disable the x-power-by express message in the header
app.disable('x-powered-by');

// not needed already served up by io app.use('/javascript/socket.io', express.static(path.join(__dirname, 'node_modules', 'socket.io', 'node_modules', 'socket.io-client', 'dist')));
app.use('/javascript/fontawesome', express.static(path.join(__dirname, 'node_modules', 'font-awesome')));
app.use('/javascript/bootstrap', express.static(path.join(__dirname, 'node_modules', 'bootstrap', 'dist')));
app.use('/javascript/jquery', express.static(path.join(__dirname, 'node_modules', 'jquery', 'dist')));
app.use('/javascript/moment', express.static(path.join(__dirname, 'node_modules', 'moment', 'min')));
app.use('/javascript/bootstrap-notify', express.static(path.join(__dirname, 'node_modules', 'bootstrap-notify')));
app.use('/javascript/animate-css', express.static(path.join(__dirname, 'node_modules', 'animate.css')));
app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

var routes = express.Router();


var handlePublicFileRequest = function (req, res) {
    var filePath = req.path;

    if (filePath === "/") {
        filePath = "/index.htm";
    }
    console.log('handlePublicFileRequest ' + filePath + ' ...');

    if (fs.existsSync(path.join(__dirname, 'public',filePath)) === true) {
        res.sendFile(filePath, { root: path.join(__dirname, 'public') });  
    } else {
        filePath = "/index.htm";
        res.sendFile(filePath, { root: path.join(__dirname, 'public') });
        //res.sendStatus(404);
    }
       
};

routes.get('/*', function (req, res) {
    handlePublicFileRequest(req, res);
});

app.use('/', routes);

const ioServer = require('socket.io');
var io = null;

io = new ioServer();

var https_srv = null;
if (objOptions.useHttps === true) {
    var httpsOptions = {
        key: fs.readFileSync(path.join(__dirname, 'config', 'server.key')),
        cert: fs.readFileSync(path.join(__dirname, 'config', 'server.cert'))
    };
    if (objOptions.useHttpsClientCertAuth) {
        httpsOptions.ca = [fs.readFileSync(path.join(__dirname, 'config', 'ca.cert'))];
        httpsOptions.requestCert = true;
        httpsOptions.rejectUnauthorized = false;
    }
    https_srv = https.createServer(httpsOptions, app).listen(objOptions.httpsport, function () {
        writeToLog('info', 'Express server listening on https port ' + objOptions.httpsport);
    });
    io.attach(https_srv);
}

var http_srv = null;
if (objOptions.useHttp === true) {
    http_srv = http.createServer(app).listen(objOptions.httpport, function () {
        writeToLog('info', 'Express server listening on http port ' + objOptions.httpport);
    });
    io.attach(http_srv);
};


io.on('connection', function (socket) {


    writeToLog('trace', 'browser', socket.id, 'Socketio Connection');

    if (privateData.browserSockets[socket.id] === undefined) {
        privateData.browserSockets[socket.id] = {
            socket: socket,
            logLevel: objOptions.logLevel

        };
    }

    socket.on('ping', function (data) {
        writeToLog('trace', 'browser', socket.id, 'ping');
    });

    // disable for port http; force authentication
    socket.on('audiostop', function (data) {
        writeToLog('debug', 'browser', socket.id, 'audiostop');
        audioStop();
    });

    

    socket.on('ServerStart', function (data) {
        writeToLog('debug', 'browser', socket.id, 'ServerStart',data);
        exec("docker restart hydra_minecraft", (error, stdout, stderr) => {
            if (error) {
                writeToLog('error', `error: ${error.message}`);
                return;
            }
            if (stderr) {
                writeToLog('info',`stderr: ${stderr}`);
                return;
            }
            writeToLog('info',`stdout: ${stdout}`);
        });
    });

    

    socket.on("disconnect", function () {
        try {
            writeToLog("info", 'browser', socket.id, "disconnect", getSocketInfo(socket));
            if (privateData.browserSockets[socket.id]) {
                delete privateData.browserSockets[socket.id];
            }
        } catch (ex) {
            writeToLog('error', 'Error socket on', ex);
        }
    })

      

    //This is a new connection, so send info to commonData
    socket.emit('commonData', commonData);

});