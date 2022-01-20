"use strict";
const appName = "mongoRestService";
const extend = require('extend');
const Logger = require("./logger.js");
const moment = require('moment');
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const MongoDB = require('mongodb');
const MongoDbRest = require('express-mongodb-rest');

var mongoRestService = function (options) {
    var self = this;
    var defaultOptions = {
        mongoDbServerUrl: "",
        mongoDbDatabaseName:"",
        mongoClientOptions: {useUnifiedTopology: true},
        apiRootPath: "/api/generic"
    };
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

    
    

    
    var BindRoutes = function (app) {
        
        try {

            //Create mongoDB Rest Service
            const mongoDbRestOptions = 
                {
                    mongodb:{
                        connection:objOptions.mongoDbServerUrl,
                        database: objOptions.mongoDbDatabaseName,
                        options: {
                            useUnifiedTopology: true
                        }
                    }
                    ,
                    rest:{
                        GET:{
                            database: objOptions.mongoDbDatabaseName,
                            method:"find",
                            query: {q:{}},
                            handler:{
                                find:   function(req, res, next, data) {
                                            var collection = data.mongodb.collection;
                                            var query = data.rest.query;
                                            collection.find(query.q, query.options)
                                            .limit(100)
                                            .toArray()
                                            .then(
                                                function(result) {        
                                                    res.json(result);
                                                },
                                                function(err){
                                                    next(err);
                                                }
                                            )
                                        },
                                count:  function(req, res, next, data) {
                                    var collection = data.mongodb.collection;
                                    var query = data.rest.query;
                                    collection.count(query.q, query.options).then(
                                        function(result) {
                                            res.json({count: result});
                                        },
                                        function(err){
                                            next(err);
                                        }
                                        
                                    );
                                }
                            }
                        },
                        POST: {
                            method:"insertOne",
                            query: {empty:{}},
                            handler:{
                                insertOne:   
                                function(req, res, next, data) {
                                    var collection = data.mongodb.collection;
                                    var insertedObject = req.body;
                                    var query = {q:insertedObject};
                                    collection.insertOne(query.q, query.options).then(
                                        function(result) {
                                            insertedObject._id = result.insertedId;
                                            res.json(insertedObject);
                                        },
                                        function(err){
                                            next(err);
                                        }       
                                    );
                                }   
                            }
                        }
                    }
                };
                const mongoDbRestOptionsWithID = 
                {
                    mongodb:{
                        connection:objOptions.mongoDbServerUrl,
                        database: objOptions.mongoDbDatabaseName,
                        options: {
                            useUnifiedTopology: true
                        }
                    },
                    rest:{
                        GET:{
                            database: objOptions.mongoDbDatabaseName,
                            method:"findOne",
                            query : {q:{_id:null}}, //need something here to get to handler
                            handler:{
                                findOne:   
                                function(req, res, next, data) {
                                    var collection = data.mongodb.collection;
                                    var query = {q:{"_id": MongoDB.ObjectId(req.params._id)}};
                                    collection.findOne(query.q, query.projections).then(
                                        function(result) {
                                            res.json(result);
                                        },
                                        function(err){
                                            next(err);
                                        }
                                    );
                                }
                            }
                        },
                        PUT: {
                            method:"updateOne",
                            query : {q:{_id:null}},
                            handler:{
                                updateOne:   
                                function(req, res, next, data) {
                                    var collection = data.mongodb.collection;
                                    var query = {
                                        q:{"_id": MongoDB.ObjectId(req.params._id)}, 
                                        options:{ "upsert": false }
                                    };
                                    var updateObject = {"$set":  req.body};
                                    collection.updateOne(query.q, updateObject, query.options).then(
                                        function(result) {
                                            
                                            if(result.modifiedCount == 1){
                                                res.sendStatus(200);
                                                //res.json(result);
                                            }else{
                                                res.sendStatus(404)
                                            }
                                        },
                                        function(err){
                                            next(err);
                                        }
                                    );
                                },
                            }
                        },
                        DELETE:{
                            method:"deleteOne",
                            query : {q:{_id:null}},
                            handler:{
                                deleteOne:   
                                function(req, res, next, data) {
                                    var collection = data.mongodb.collection;
                                    var query = {q:{"_id": MongoDB.ObjectId(req.params._id)}};
                                    collection.deleteOne(query.q).then(
                                        function(result) {
                                            if(result.deletedCount == 1){
                                                res.sendStatus(200);
                                                //res.json(result);
                                            }else{
                                                res.sendStatus(404)
                                            }
                                        },
                                        function(err){
                                            next(err);
                                        }      
                                    );
                                },
                            }
                        }
                    }
                };

                app.use('/api/:collection/:_id', MongoDbRest(mongoDbRestOptionsWithID)); // enable other collections
                app.use('/api/:collection', MongoDbRest(mongoDbRestOptions)); // enable other collections
                
                
                

        } catch (ex) {
            debug("error", ex );
        }
        
    }



    self.bindRoutes = BindRoutes;
};
module.exports = mongoRestService;