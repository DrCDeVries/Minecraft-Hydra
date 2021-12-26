use minecrafthydra
db.createUser(
{
   user:"Minecraft-Hydra",
   pwd:"MinecraftGood",
   roles: [ { role: "dbOwner", db: "minecrafthydra" }]
}
)

db.createCollection( "Account",
   {     
     autoIndexId: true
   }
)
db.Account.createIndex( { "uuid": 1 } )

db.createCollection( "RefreshToken",
   {     
     autoIndexId: true
   }
)

db.RefreshToken.createIndex( { "expireAt": 1 }, { expireAfterSeconds: 0 } )

db.ut_RefreshToken.createIndex( { "refresh_token": 1 } )

db.createCollection( "AccessToken",
   {     
     autoIndexId: true
   }
)

db.AuthToken.createIndex( { "expireAt": 1 }, { expireAfterSeconds: 0 } )

db.AuthToken.createIndex( { "access_token": 1 } )


db.createCollection( "PageContent",
   {
     
     autoIndexId: true
   }
)

db.PageContent.createIndex( { "pageContentGuid": 1 } )

db.PageContent.insertMany(
[
{
    "_id" : ObjectId("5edea608a7f66bdcd0decba7"),
    "content" : "<h3>Minecraft Hydra.</h3><p>Welcome to our Minecraft Hydra Server</p>",
    "createdBy" : "",
    "createdDate" : "2012-11-12T14:34:29.77+00:00",
    "deleted" : false,
    "displayOrder" : 100,
    "extendedArrayData" : "",
    "extendedBooleanData" : false,
    "extendedNumericData" : 0,
    "extendedTextData" : "",
    "linkMenuDisplay" : true,
    "linkStatus" : 1,
    "linkTarget" : "_self",
    "linkText" : "Home",
    "linkUrl" : "/",
    "pageContentGuid" : "00000000-0000-0000-0000-000000000001",
    "pageDescription" : " Website Home Page",
    "pageKeywords" : "",
    "pageName" : "Home",
    "pageTitle" : "Home Page",
    "parentPageContentGuid" : null,
    "updatedBy" : "adevries@digitalexample.com",
    "updatedDate" : "2016-02-22T16:00:04.593+00:00"
}


]
)