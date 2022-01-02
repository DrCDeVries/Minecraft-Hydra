"use strict";

const appName = "server"
const path = require('path');
const extend = require('extend');
const { v4: uuidv4 } = require('uuid');
const Defer = require('node-promise').defer;
const moment = require('moment');
const fs = require('fs');
const Logger = require("./logger.js");
var minecraftAuth = require("minecraft-auth")
var MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

var minecraftLoginService = function (options) {
    var self = this;
    var defaultOptions = {
        loginRootPath : "/login"
    }
    var objOptions = extend({}, defaultOptions, options);
    self.objOptions = objOptions;
   
    var debug = null;
    if (self.objOptions.appLogger){
        debug = function(loglevel){
            let args = []
            for (let i = 0; i < arguments.length; i++) {
                if (arguments[i] === undefined) {
                    args.push("undefined")
                } else if (arguments[i] === null) {
                    args.push("null")
                }
                else {
                    args.push(JSON.parse(JSON.stringify(arguments[i])))
                }
            }
            if (args.length > 1) {
                args.shift(); //remove the loglevel from the array
            }
            self.objOptions.appLogger.log(appName, "app", loglevel, args);
        }
    }else{
        debug = require('debug')(appName);
    }

    minecraftAuth.MicrosoftAuth.setup(objOptions.microsoftAppID, objOptions.microsoftAppSecret, objOptions.microsoftRedirectUrl);


    var BindRoutes = function (routes) {
        
        try {

            routes.post(path.join(objOptions.loginRootPath,  '/microsoft'), loginMicrosoft);
            routes.get(path.join(objOptions.loginRootPath,'/microsoft/oauth'), loginMicrosoftOauth);
            routes.get(path.join(objOptions.loginRootPath, '/login/mojang'), loginMojang);
                

        } catch (ex) {
            res.status(500).json({ "msg": "An Error Occured!", "error": ex });
        }
        
    }



    var loginMicrosoft = function(req, res){
        try {
            var url = minecraftAuth.MicrosoftAuth.createUrl();
            //res.redirect(url);

            res.json({url: url});
        } catch (e) {
            handleError(req,res,e);
        }
    }

    var loginMicrosoftOauth = function(req, res){
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
                                        loginResponse(account).then(
                                            function(retval){
                                                appLogger.log(appName, "browser",'debug', profileResponse, account);
                                                res.json(retval);
                                            },
                                            function(err){
                                                handleError(req,res,err);
                                            }
                                        ) 
                                        
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
                },
                function(err){
                    handleError(req,res,err);
                }
            )
            
        } catch (e) {
            handleError(req,res,e);
        }
    }





    var loginMojang = function(req, res){
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
                                        
                                        loginResponse(account).then(
                                            function(retval){
                                                res.json(retval);
                                            },
                                            function(err){
                                                handleError(req,res,err);
                                            }
                                        )   
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
                },
                function(err){
                    handleError(req,res,err);
                }
            )
            
        } catch (e) {
            handleError(req,res,e);
        }
    }

    var loginResponse = function(account){
        var deferred = Defer();
        
        try {
            upsertAccount(account).then(
                function(){
                    createRefreshToken(account).then(
                        function(refreshToken){
                            createAuthToken(refreshToken.refreshTokenId).then(
                                function(authToken){
                                    let retval = {
                                        refresh_token: refreshToken.refresh_token,
                                        expireAt: refreshToken.expireAt,
                                        token_type: refreshToken.token_type,
                                        expiresIn: refreshToken.expiresIn,
                                        expiresOn: refreshToken.expiresOn,
                                        accessTokenExpiresIn: authToken.accessTokenExpiresIn,
                                        access_token: authToken.access_token,
                                        account: {

                                            type: account.type,
                                            username: account.username,
                                            uuid: account.uuid

                                        }

                                    }
                                    appLogger.log(appName, "browser", 'debug', retval);
                                    deferred.resolve(retval);
                                },
                                function(err){
                                    deferred.reject(err);
                                    
                                }

                            )
                        },
                        function(err){
                            deferred.reject(err);
                        }
                    )
                    
                },
                function(err){
                    deferred.reject(err);
                }

            )
        }catch (ex) {
            appLogger.log(appName, "browser", 'error', 'loginResponse',  { "msg": ex.message, "stack": ex.stack });
            deferred.reject({ "code": 500, "msg": "An Error Occured!", "error": ex });
        }
        
        return deferred.promise;   
    }


    var upsertAccount = function(account){
        var deferred = Defer();
        
        try {
            const client = new MongoClient(objOptions.mongoDbServerUrl,objOptions.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect(function (err, client) {
                try {
                    assert.equal(null, err);
                    const db = client.db(objOptions.mongoDbDatabaseName);
                    const collection = db.collection('Account');
                    if (collection) {
                        const query = { uuid: account.uuid };
                        const update = { $set: account};
                        const options = { upsert: true };
                        // collection.insertOne(account).then(                            
                        //         function (err, doc) {
                        //             assert.equal(err, null);
                        //             client.close();
                        //             deferred.resolve(account);
                        //         },
                        //         function(err){
                        //             deferred.reject(err);
                        //         }
                        //         );
                        collection.updateOne(query, update, options,                            
                            function (err, doc) {
                                assert.equal(err, null);
                                client.close();
                                deferred.resolve(account);
                            });
                    } else {
                        appLogger.log(appName, "browser", "error", "upsertAccount", { "msg": "Not Able to Open MongoDB Connection", "stack": "" });
                        client.close();
                        deferred.reject({ "code": 500, "msg": "Not Able to Open MongoDB Connection", "error": "collection is null"});
                    }
                } catch (ex) {
                    appLogger.log(appName, "browser", "error", "createRefreshToken", { "msg": ex.message, "stack": ex.stack });
                    client.close();
                    deferred.reject({ "code": 500, "msg": ex.message, "error": ex });
                }
            });
        } catch (ex) {
            appLogger.log(appName, "browser", 'error', 'createRefreshToken',  { "msg": ex.message, "stack": ex.stack });
            deferred.reject({ "code": 500, "msg": "An Error Occured!", "error": ex });
        }
        
        return deferred.promise;     
    }

    var createRefreshToken = function (account){
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
                        const expireAt = 259200; // 3 * 24 * 60 * 60;  //expire Token in 3 days ie it will get auto deleted by Mongo
                        var data = {
                            account: account,
                            refresh_token: uuidv4(),
                            expireAt: expireAt,
                            token_type: "bearer",
                            expiresIn: expireAt,  
                            expiresOn : moment().add( expireAt, 'seconds').toISOString()
                        }
                        collection.insertOne(data,                            
                                function (err, doc) {
                                    assert.equal(err, null);
                                    client.close();
                                    deferred.resolve(data);
                                });
                    } else {
                        appLogger.log(appName, "browser", "error", "createRefreshToken", { "msg": "Not Able to Open MongoDB Connection", "stack": "" });
                        client.close();
                        deferred.reject({ "code": 500, "msg": "Not Able to Open MongoDB Connection", "error": "collection is null"});
                    }
                } catch (ex) {
                    appLogger.log(appName, "browser", "error", "createRefreshToken", { "msg": ex.message, "stack": ex.stack });
                    client.close();
                    deferred.reject({ "code": 500, "msg": ex.message, "error": ex });
                }
            });
        } catch (ex) {
            appLogger.log(appName, "browser", 'error', 'createRefreshToken',  { "msg": ex.message, "stack": ex.stack });
            deferred.reject({ "code": 500, "msg": "An Error Occured!", "error": ex });
        }
        
        return deferred.promise;     
    }


    var createAccessToken = function (refresh_token){
        var deferred = Defer();
        
        try {
            const client = new MongoClient(objOptions.mongoDbServerUrl,objOptions.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect(function (err, client) {
                try {
                    assert.equal(null, err);
                    const db = client.db(objOptions.mongoDbDatabaseName);
                    const collection = db.collection('AccessToken');
                    if (collection) {
                        var data = {};
                        data.access_token = uuidv4();
                        //if (data.expireAt === undefined || data.expireAt === null){
                        data.expireAt = 3600; //  60 * 60;  //expire Token in 1 hour ie it will get auto deleted by Mongo
                        //}
                        data.accessTokenExpiresIn = data.expireAt; 
                        data.refresh_token = refresh_token;
                        //data.authTokenExpiresOn = moment().add( data.expireAt, 'seconds').toISOString();
                        collection.insertOne(data,                            
                                function (err, doc) {
                                    assert.equal(err, null);
                                    
                                    client.close();
                                    deferred.resolve(data);
                                });
                    } else {
                        appLogger.log(appName, "browser", "error", "createAccessToken", { "msg": "Not Able to Open MongoDB Connection", "stack": "" });
                        client.close();
                        deferred.reject({ "code": 500, "msg": "Not Able to Open MongoDB Connection", "error": "collection is null"});
                    }
                } catch (ex) {
                    appLogger.log(appName, "browser", "error", "createAccessToken", { "msg": ex.message, "stack": ex.stack });
                    client.close();
                    deferred.reject({ "code": 500, "msg": ex.message, "error": ex });
                }
            });
        } catch (ex) {
            appLogger.log(appName, "browser", 'error', 'createAccessToken',  { "msg": ex.message, "stack": ex.stack });
            deferred.reject({ "code": 500, "msg": "An Error Occured!", "error": ex });
        }
        
        return deferred.promise;     
    }

    self.bindRoutes = BindRoutes;
    
};
module.exports = minecraftLoginService;