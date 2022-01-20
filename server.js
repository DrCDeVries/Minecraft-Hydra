const appName = 'minecrafthydra';
const http = require('http');
const https = require('https');
//const debug = require('debug')(appName);
const path = require('path');
const extend = require('extend');
const express = require('express');
const favicon = require('serve-favicon');
const cookieParser = require('cookie-parser');
const packagejson = require('./package.json');
const version = packagejson.version;
const { v4: uuidv4 } = require('uuid');
const Deferred = require('node-promise').defer;
const moment = require('moment');
const fs = require('fs');
const { exec } = require("child_process");
const Logger = require("./logger.js");
const ioServer = require('socket.io');
const MongoRestService = require('./mongoRestService');

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


var appLogHandler = function (logData) {
    //add to the top of the log
    privateData.logs.push(logData);
    if (privateData.logs.length > objOptions.maxLogLength) {
        privateData.logs.shift();
    }
}

var appLogger = new Logger({
    logLevels: objOptions.logLevels,
    debugUtilName: appName,
    logName: appName,
    logEventHandler: appLogHandler,
    logFolder: objOptions.logDirectory
})

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
app.use(express.json());
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
    }else if (filePath.startsWith("/page/") == true || filePath == "/" ) {
        filePath = "/index.htm";
        res.sendFile(filePath, { root: path.join(__dirname, 'public') });
        //res.sendStatus(404);
    } else {
        res.sendStatus(404);
    }
       
};

routes.post('/apitest/connor', function (req, res) {
  console.log(req.body)
res.json({sucsess:true})
});


const mongoRestService = new MongoRestService(
    {
        mongoDbServerUrl: objOptions.mongoDbServerUrl,
        mongoDbDatabaseName:objOptions.mongoDbDatabaseName,
        apiRootPath: "/api",
        appLogger: appLogger
    }
)
mongoRestService.bindRoutes(app);


routes.get('/*', function (req, res) {
    handlePublicFileRequest(req, res);
});

app.use('/', routes);

var io = null;

io = ioServer();

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
        appLogger.log(appName, "app", 'info', 'Express server listening on https port ' + objOptions.httpsport);
    });
    io.attach(https_srv);
}

var http_srv = null;
if (objOptions.useHttp === true) {
    http_srv = http.createServer(app).listen(objOptions.httpport, function () {
        appLogger.log(appName, "app", 'info', 'Express server listening on http port ' + objOptions.httpport);
    });
    io.attach(http_srv);
};


io.on('connection', function (socket) {


    appLogger.log(appName, "browser", "trace", socket.id, 'Socketio Connection');

    if (privateData.browserSockets[socket.id] === undefined) {
        privateData.browserSockets[socket.id] = {
            socket: socket,
            logLevel: objOptions.logLevel

        };
    }

    socket.on('ping', function (data) {
        appLogger.log(appName, "browser", "trace", socket.id, "ping");
    }); 

    socket.on('ServerStart', function (data) {
        appLogger.log(appName, "browser", "debug",  socket.id, 'ServerStart', data);
        exec("docker restart hydra_minecraft", (error, stdout, stderr) => {
            if (error) {
                appLogger.log(appName, "app", "error", `error: ${error.message}`);
                return;
            }
            if (stderr) {
                appLogger.log(appName, "app", "info", `stderr: ${stderr}`);
                return;
            }
            appLogger.log(appName, "app", "info", `stdout: ${stdout}`);
        });
    });


    socket.on('Coreprotect', function (data) {
        appLogger.log(appName, "browser", "info", "Coreprotect test") ;
    });

    

    socket.on("disconnect", function () {
        try {
            appLogger.log(appName, "browser", "info",  socket.id, "disconnect", getSocketInfo(socket));
            if (privateData.browserSockets[socket.id]) {
                delete privateData.browserSockets[socket.id];
            }
        } catch (ex) {
            appLogger.log(appName, "browser", "error", "Error socket on", ex);
        }
    })

      

    //This is a new connection, so send info to commonData
    socket.emit('commonData', commonData);

});