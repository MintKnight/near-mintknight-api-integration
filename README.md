# near-mintknight-api-integration

Partial code parts of the integration with Near.

The code in this repository is partially taken from the Mintknight API.

This repository is temporarily publicly available.

Sensitive data is not shared. The code that is exposed refers to the part of the integration with Near.

# Content gates

Content or token gates are used to create access to content linked to a contract and to an NFT.

We have created a CRUD to manage access to content.
- We can see the code in "src/routes/contentGates"
- The endpoints are documented in swagger format (openAPI). We can also see them here: [https://api.mintknight.com/api-docs/#/contents](https://api.mintknight.com/api-docs/#/contents)

API calls carry a 'Bearer' bearer token. This token must be provided by the Mintknight team.

The Content gate process would be as follows:
1. Creation of a "content access" POST (contentGate/v2)
2. When you want to check access to content, you first have to call the "Get a new challenge" (GET) endpoint. It will return the message with which we have to sign. GET (contentGate/v2/challenge/{address}), where {address} is the accountId of Near. The message is the _id that the call returns.
3. The user signs with the received challenge. Signature example:

```javascript
  const network = "near.testnet";
  const accountId = 'a123.testnet';
  const privateKey = "0123...";
  const credentials = { accountId, privateKey };

  // The challenge
  const challenge = "Message received calling: Get a new challenge from mintknight. _id is the message";

  let ret = await Near.signMessage(
    challenge,
    network,
    credentials,
  );
  if (!ret.success) {
    console.log('Oops! Error sign message. Account Id: ' + accountId);
    process. exit(1);
  }

  console.log(`Account: `, accountId);
  console.log(`Message: `, message);
  console.log(`Signature`, ret.signature);
```

4. The user makes the call to Mintknight: POST (contentGate/v2/check) with the following parameters:

```json
  {
    "nftId": "string",
    "address": "string",
    "walletId": "string",
    "contentGateId": "string",
    "signature": "string",
    "challenge": "string"
  }
```
     a. nftId: NFT identifier (mintknight NFT)
     b. address: Near accountId
     c. walletId: WalletId (optional) mintknight internal wallet
     d. contentGateId: It is the Id of the access to cotentgate that we have created in step 1.
     e. signature
     f. challenge: it is the message that we have used to sign. It is the _id returned by the GET (contentGate/v2/challenge/{accountId})


## Integration and examples

All the integration referring to the contents can be found in:
- src/routes/contenGates.js
- src/controllers/contenGates.js
- src/utils/near.js

We can find and script or test how to sign and verify with Near wallets.
- src/scripts/testSignChallengeNear.js


# Build account abstraction and recovery system for NEAR wallets

When creating a wallet, we encrypt the key with 'Shamir Secret Sharing' in 3 portions. To recover the private key we only need 2 portions.

A portion of the key (skey1) is returned in the wallet creation request. This has to be kept by the client. And the other portions (skey and skey2) are kept by Mintknight.

How encryption works:

```javascript
  const Shamir = require('src/utils/shamir');

  // NEAR PRIVATE KEY
  const privateKey = keyPair.secretKey;

// Encryption
  const keys = 3; // Private key will be divided in 3 parts
  const threshold = 2; // We need 2 parts to build the privatekey
  const shamir = Shamir.newSharedKeys(
    privateKey,
    keys,
    threshold,
  );

  const skey = shamir[0];
  const skey1 = shamir[1];
  const skey2 = shamir[2];
```

- skey1: for the user who makes the request to create the wallet
- skey and skey2: Mintknight save those wallets in two diferent ways.

How the wallet recovery works:

```javascript
  const Shamir = require('src/utils/shamir');

  const privateKey = Shamir.getSeedFromSharedKeys(skey, skey1);
```

## Integration and examples

We can see how Mintknight encrypts the wallet and divides it into 3 portions:

- src/utils/near.js
    - method: deployWallet
    - method: addWallet
