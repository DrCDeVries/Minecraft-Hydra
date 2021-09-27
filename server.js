const appName = "server"
const http = require('http');
const https = require('https');
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
const ConfigHandler = require("./configHandler.js");
const ACMECert = require('./acmeCertificateManager');
const ACMEHttp01 = require('./acme-http-01-memory.js');
const OpenSSL = require('./openssl.js');
const Logger = require("./logger.js");
const ioServer = require('socket.io');
var minecraftAuth = require("minecraft-auth")
var MongoClient = require('mongodb').MongoClient;
const assert = require('assert');


var configFileOptions = {
    "configDirectory": "config",
    "configFileName": "config.json"
}
if (process.env.localDebug === 'true') {
    console.log("localDebug is enabled")
    configFileOptions.configDirectory = "config/localDebug"
}

var defaultConfig = {
    //loaded from the config file
    //var port = process.env.PORT || 1337;
    "configDirectory": configFileOptions.configDirectory,
    "adminRoute": "/admin",
    "useHttps" : false,
    "useHttp" : true,
    "httpsport": 443,
    "httpport": 80,
    "httpsServerKey": "server.key",
    "httpsServerCert": "server.cert",
    "logDirectory": "logs",
    "microsoftAppID": "00000000-0000-0000-0000-000000000000",
    "microsoftAppSecret": "00000000-0000-0000-0000-000000000000",
    "appLogLevels":{
        "server": {
            "app":"info",
            "browser":"info"
        },
        "acmeCertificateManager":{"app":"info"}
    }
};

var configHandler = new ConfigHandler(configFileOptions, defaultConfig);

var objOptions = configHandler.getConfig();

var appLogHandler = function (logData) {
    //add to the top of the log
    privateData.logs.push(logData);
    if (privateData.logs.length > objOptions.maxLogLength) {
        privateData.logs.shift();
    }
}

var appLogger = new Logger({
    logLevels: objOptions.logLevels,
    debugUtilName: "minecrafthydra",
    logName: "minecraft-hydra",
    logEventHandler: appLogHandler,
    logFolder: objOptions.logDirectory
})



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

var getErrorObject = function(error){
    //this is used to normolize errors that are raised and returned to the client
    var errorData = {
        error : {
            msg: "An Error Occured!", error: "An Error Occured!", stack: ""
        },
        statuscode:500
    }
    
    if (error.msg) {
        errorData.error.msg = errorData.error.msg + ' ' + error.msg;
    }
    if (error.message) {
        errorData.error.msg = errorData.error.msg + ' ' + error.message;
    }
    
    if (error.error) {
        if (typeof (error.error) === "string") {
            errorData.error.error = error.error;
        } else {
            if (error.error.msg) {
                errorData.error.error = error.error.msg;
            } else if (error.error.message) {
                errorData.error.error = error.error.message;
            }
            if (error.error.stack) {
                errorData.error.stack = error.error.stack;
            }
        }
    } else if (typeof (error) === "string") {
        errorData.error.error = error;
    }
    
    
    if (error.code) {
        errorData.statuscode = error.code;
    } else if (error.statuscode) {
        errorData.statuscode = error.statuscode;
    }
    return errorData;
}

var handleError = function (req, res, error) {
    let errorData = getErrorObject(error)
    appLogger.log(appName, "browser",'error', error);
    res.status(errorData.statuscode).json(errorData.error);
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

//var routes = express.Router();


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

minecraftAuth.MicrosoftAuth.setup(objOptions.microsoftAppID, objOptions.microsoftAppSecret, objOptions.microsoftRedirectUrl);

app.get('/login/microsoft', function(req, res){
    try {
        var url = minecraftAuth.MicrosoftAuth.createUrl();
        res.redirect(url);

        //res.json({url: url});
    } catch (e) {
        handleError(req,res,e);
    }
})

app.get('/login/microsoft/oauth', function(req, res){
    try {

        let code = req.query.code;
        let account = new minecraftAuth.MicrosoftAccount();
        account.authFlow(code).then(
            function(result){
                account.checkOwnership().then(
                    function(ownsMinecraft){
                        if(ownsMinecraft){
                            account.getProfile().then(
                                function(profileResponse){
                                    appLogger.log(appName, "browser",'debug', profileResponse, account);
                                },
                                function(err){
                                    handleError(req,res,err);
                                }
                            )
                        }else{
                            handleError(req,res,{msg:"User does not have minecraft assinged to Microsoft Account", error: "User does not have minecraft assinged to Microsoft Account" });
                        }
                    },
                    function(err){
                        handleError(req,res,err);
                    }
                );
                
                appLogger.log(appName, "browser",'debug', tokenData);
            },
            function(err){
                handleError(req,res,err);
            }
        )
        // account.authFlow(result.code).then(function(result){
            // minecraftAuth.MicrosoftAuth.getToken(code).then(
            //     function(refreshToken){
            //         minecraftAuth.MicrosoftAuth.authXBL(refreshToken.access_token).then(
            //             function(XBLResponse){
            //                 minecraftAuth.MicrosoftAuth.authXSTS(XBLResponse.Token).then(
            //                     function(XSTSResponse){
            //                         minecraftAuth.MicrosoftAuth.getMinecraftToken(XSTSResponse.Token,XBLResponse.DisplayClaims.xui[0].uhs).then(
            //                             function(MCTokenResponse){
            //                                 var tokenData = {
            //                                     refreshToken: refreshToken,
            //                                     XBLResponse: XBLResponse,
            //                                     XSTSResponse: XSTSResponse,
            //                                     MCTokenResponse: MCTokenResponse
            //                                 }
            //                                 appLogger.log(appName, "browser",'debug', tokenData);
            //                             },
            //                             function(err){
            //                                 handleError(req,res,err);
            //                             }
            //                         )
            //                         //we Are four Tokens Deep at this point
                                    
            //                     },
            //                     function(err){
            //                         handleError(req,res,err);
            //                     }
                                
            //                 )
            //             },
            //             function(err){
            //                 handleError(req,res,err);
            //             }
            //         )
            //     },
            //     function(err){
            //         handleError(req,res,err);
            //     }
            // )  
    } catch (e) {
        handleError(req,res,e);
    }
})





app.post('/login/mojang', function(req, res){
    try {
        var data = req.body;
        
        
        let account = new minecraftAuth.MojangAccount();
        account.Login(data.username, data.password).then(
            function(result){
                account.checkOwnership().then(
                    function(ownsMinecraft){
                        if(ownsMinecraft){
                            account.getProfile().then(
                                function(profileResponse){
                                    appLogger.log(appName, "browser",'debug', profileResponse, account);
                                },
                                function(err){
                                    handleError(req,res,err);
                                }
                            )
                        }else{
                            handleError(req,res,{msg:"User does not have minecraft assinged to Microsoft Account", error: "User does not have minecraft assinged to Microsoft Account" });
                        }
                    },
                    function(err){
                        handleError(req,res,err);
                    }
                );
                
                appLogger.log(appName, "browser",'debug', tokenData);
            },
            function(err){
                handleError(req,res,err);
            }
        )
         
    } catch (e) {
        handleError(req,res,e);
    }
})

 app.get('/*', function (req, res) {   //Must be Last One Added
    handlePublicFileRequest(req, res);
 });


 var createRefreshToken = function (data){
    var deferred = Defer();
    
    try {
        const client = new MongoClient(objOptions.mongoDbServerUrl,objOptions.mongoClientOptions);
        // Use connect method to connect to the Server
        client.connect(function (err, client) {
            try {
                assert.equal(null, err);
                const db = client.db(objOptions.mongoDbDatabaseName);
                const collection = db.collection('RefreshToken');
                if (collection) {
                    if (data.refresh_token === undefined || data.refresh_token === null){
                        data.refresh_token = uuidv4();
                    }
                    //if (data.expireAt === undefined || data.expireAt === null){
                    data.expireAt = 259200; // 3 * 24 * 60 * 60;  //expire Token in 3 days ie it will get auto deleted by Mongo
                    //}
                    data.token_type = "bearer"
                    data.expiresIn = data.expireAt; 
                    data.expiresOn = moment().add( data.expireAt, 'seconds').toISOString();
                    collection.insertOne(data,                            
                            function (err, doc) {
                                assert.equal(err, null);
                                client.close();
                                deferred.resolve(data);
                            });
                } else {
                    debug("error", "createRefreshToken", { "msg": "Not Able to Open MongoDB Connection", "stack": "" });
                    client.close();
                    deferred.reject({ "code": 500, "msg": "Not Able to Open MongoDB Connection", "error": "collection is null"});
                }
            } catch (ex) {
                debug("error", "createRefreshToken", { "msg": ex.message, "stack": ex.stack });
                client.close();
                deferred.reject({ "code": 500, "msg": ex.message, "error": ex });
            }
        });
    } catch (ex) {
        debug('error', 'createRefreshToken',  { "msg": ex.message, "stack": ex.stack });
        deferred.reject({ "code": 500, "msg": "An Error Occured!", "error": ex });
    }
    
    return deferred.promise;     
}


var createAuthToken = function (refreshTokenId){
    var deferred = Defer();
    
    try {
        const client = new MongoClient(objOptions.mongoDbServerUrl,objOptions.mongoClientOptions);
        // Use connect method to connect to the Server
        client.connect(function (err, client) {
            try {
                assert.equal(null, err);
                const db = client.db(objOptions.mongoDbDatabaseName);
                const collection = db.collection('AuthToken');
                if (collection) {
                    var data = {};
                    data.authToken = uuidv4();
                    //if (data.expireAt === undefined || data.expireAt === null){
                    data.expireAt = 3600; //  60 * 60;  //expire Token in 1 hour ie it will get auto deleted by Mongo
                    //}
                    data.authTokenExpiresIn = data.expireAt; 
                    data.refreshToken = refreshToken;
                    //data.authTokenExpiresOn = moment().add( data.expireAt, 'seconds').toISOString();
                    collection.insertOne(data,                            
                            function (err, doc) {
                                assert.equal(err, null);
                                
                                client.close();
                                deferred.resolve(data);
                            });
                } else {
                    debug("error", "createRefreshToken", { "msg": "Not Able to Open MongoDB Connection", "stack": "" });
                    client.close();
                    deferred.reject({ "code": 500, "msg": "Not Able to Open MongoDB Connection", "error": "collection is null"});
                }
            } catch (ex) {
                debug("error", "createRefreshToken", { "msg": ex.message, "stack": ex.stack });
                client.close();
                deferred.reject({ "code": 500, "msg": ex.message, "error": ex });
            }
        });
    } catch (ex) {
        debug('error', 'createRefreshToken',  { "msg": ex.message, "stack": ex.stack });
        deferred.reject({ "code": 500, "msg": "An Error Occured!", "error": ex });
    }
    
    return deferred.promise;     
}



var io = null;
io =  ioServer();

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
        appLogger.log(appName, "app",'info', 'Express server listening on https port ' + objOptions.httpsport);
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


    appLogger.log(appName, "app", 'trace', 'browser', socket.id, 'Socketio Connection');

    if (privateData.browserSockets[socket.id] === undefined) {
        privateData.browserSockets[socket.id] = {
            socket: socket,
            logLevel: objOptions.logLevel

        };
    }

    socket.on('ping', function (data) {
        appLogger.log(appName, "app", 'trace', 'browser', socket.id, 'ping');
    });

    // disable for port http; force authentication
    socket.on('audiostop', function (data) {
        appLogger.log(appName, "app", 'debug', 'browser', socket.id, 'audiostop');
        audioStop();
    });

    

    socket.on('ServerStart', function (data) {
        appLogger.log(appName, "app", 'debug', 'browser', socket.id, 'ServerStart',data);
        exec("docker restart minecrafthydra_minecraft", (error, stdout, stderr) => {
            if (error) {
                appLogger.log(appName, "app", 'error', `error: ${error.message}`);
                return;
            }
            if (stderr) {
                appLogger.log(appName, "app", 'info',`stderr: ${stderr}`);
                return;
            }
            appLogger.log(appName, "app", 'info',`stdout: ${stdout}`);
        });
    });

    

    socket.on("disconnect", function () {
        try {
            appLogger.log(appName, "app", "info", 'browser', socket.id, "disconnect", getSocketInfo(socket));
            if (privateData.browserSockets[socket.id]) {
                delete privateData.browserSockets[socket.id];
            }
        } catch (ex) {
            appLogger.log(appName, "app", 'error', 'Error socket on', ex);
        }
    })

      

    //This is a new connection, so send info to commonData
    socket.emit('commonData', commonData);

});