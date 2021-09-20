var minecraftAuth = require("minecraft-auth")
const prompt = require('prompt');

let account = new minecraftAuth.MicrosoftAccount();

async function authenticate() {
   try {
       let appID = "app id";
       let appSecret = "app secret";
       let redirectURL = "http://localhost/auth";
       minecraftAuth.MicrosoftAuth.setup(appID, appSecret, redirectURL);
       console.log(minecraftAuth.MicrosoftAuth.createUrl())
       prompt.start();
       let result = await prompt.get(['code']);
       console.log('Command-line input received:');
       console.log('  code: ' + result.code);
       await account.authFlow(result.code)
   } catch (e) {
       console.error(e)
   }
}

authenticate();