// Utils
const Near = require('../src/utils/near');

// Doc src: https://github.com/near/near-api-js/blob/master/packages/cookbook/utils/verify-signature.js

(async () => {

  const accountId = 'a123.testnet';
  const privateKey = "0123...";
  const network = "near.testnet";
  const address = "0123...";
  const message = "Hi mintknight";
  const credentials = { accountId, privateKey, address };

  let ret = await Near.signMessage(
    message, 
    network,
    credentials,
  );
  if (!ret.success) {
    console.log('Oups! Error sign message. Account Id: ' + accountId);
    process.exit(1);
  }   

  console.log(`Account: `, accountId);
  console.log(`Message: `, message);
  console.log(`Signature`, ret.signature);

  // Verify
  ret = await Near.verifySignature(
    message, 
    ret.signature,
    network,
    credentials,
  );
  console.log(`Verified`, ret.success);

  process.exit();
})();
