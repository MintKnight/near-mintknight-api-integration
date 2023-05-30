const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');
const { connect, KeyPair, keyStores, utils, transactions, Account } = require("near-api-js");
const { v4 } = require('uuid');
// Controllers
const MailController = require('../controllers/mails');
// Models
const WalletModel = require('../models/wallets');
const Contract = require('../models/contracts');
const Project = require('../models/projects');
const Nft = require('../models/nfts');
const Media = require('../models/media');
const Task = require('../models/tasks');
// Utils
const Shamir = require('./shamir');
const Helpers = require('./helpers');
const EVM = require('./evm');
const BundlrClient = require('./bundlr');
const AwsS3 = require('./awsS3');

const HOME = (process.env.HOME || process.env.USERPROFILE);
const HOMEMK = (process.env.DATA || `${HOME}/.mintknight`);
const DATAMK = Helpers.getDATAMK();

const saveShareSKey2 = (idWallet, skey2) => {
  const jsonFile = path.resolve(HOMEMK, `share-wallet.${idWallet}.json`);
  const json = {
    share: skey2,
  };
  fs.writeFileSync(jsonFile, encrypt(JSON.stringify(json)));
}

const encrypt = (message) => {
  const password = process.env.TOKEN_SECRET;
  const encrypted = CryptoJS.AES.encrypt(
    message,
    password,
  ).toString();
  return encrypted;
};

const decrypt = (encryptedMessage) => {
  if (!encryptedMessage) return null;
  const password = process.env.TOKEN_SECRET;
  const decryptedMessage = CryptoJS.AES.decrypt(encryptedMessage, password);
  const ret = decryptedMessage.toString(CryptoJS.enc.Utf8);
  return ret;
};

/**
 * Javascript Class to interact with Near
 */
module.exports = class Near {

  /**
   * Open Near masterwallet
   *
   * @param {string} Bundlr network
   * @param {number} walletIndex | Master wallet index
   * @param {boolean} getBalance
   * @returns {object} Bundlr instance & address & balance
   */
  static async getNearWallet(network, walletIndex, getBalance = true) {
    const jsonFile = path.resolve(HOMEMK, `wallet.${network}.${walletIndex}.json`);
    if (fs.existsSync(jsonFile)) {
      const rawdata = fs.readFileSync(jsonFile, 'utf8');
      const json = JSON.parse(decrypt(rawdata));
      let balance = 0;
      if (getBalance) {
        balance = await this.getBalance(json.accountId, network);
      }
      const privateKey = Shamir.getSeedFromSharedKeys(json.shamir[0], json.shamir[1]);
      return {
        address: json.address,
        balance,
        accountId: json.accountId,
        privateKey,
      };
    }
    return false;
  }

  /**
   * Deploy or add a new Wallet from task
   *
   * @param {object} task model
   * @returns {object} Shamir Shared keys and public address
   */
  static async deployWallet(task) {
    const ret = {};
    // Get project
    const project = await Project.findOne({ _id: task.projectId});
    if (!project) {
      return {success: false, error: `The project does not exist`};
    }
    // Get wallet
    const wallet = await WalletModel.findOne({ _id: task.wallet1 });
    if (!wallet) {
      return {success: false, error: `The wallet does not exist`};
    }
    // Add wallet
    const result = await this.addWallet(project.network, 3, 2, project, null, wallet._id.toString());
    if (!result.success) return result;
    // Update wallet
    wallet.address = result.address;
    wallet.owner = result.address;
    wallet.skey = result.shamir[0];
    wallet.accountId = result.accountId;
    await wallet.save(); 
    // Save skey2 (mintknight secrets)
    saveShareSKey2(wallet._id, result.shamir[2]);
    // Happy end
    ret.success = true;
    ret.txHash = '';
    ret.cost = 0;    
    ret.address = result.publicKey;
    ret.skey = result.shamir[1];
    return ret;
  }

  /**
   * Adds a new Wallet.
   *
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @param {number} keys Number of keys (total)
   * @param {number} threshold Threshold (minimum)
   * @param {object} project (optional)
   * @param {number} attachedDeposit (optional)
   * @param {string} walletId (optional)
   * @returns {object} Shamir Shared keys and public address
   */
  static async addWallet(network, keys, threshold, project = null, attachedDeposit = null, walletId = null) {
    const result = await this.createSubAccount(network, project, attachedDeposit, walletId);
    if (!result.success) {
      return {success: false, error: result.error};
    }    
    const { accountId, keyPair, nearConnection } = result;
    const publicKey = keyPair.publicKey.toString();
    const privateKey = keyPair.secretKey;

    // Check if exist
    let account;
    try {
      account = await nearConnection.account(accountId);
      await account.state(); // If the account does not exist, it´ll resolve false
    } catch (error) {
      console.log('addWallet error', error);
      return {success: false, error};
    }

    const shared = Shamir.newSharedKeys(
      privateKey,
      keys,
      threshold,
    );

    return { success: true, shamir: shared, address: publicKey, accountId, account };
  }

  /**
   * Create a new child account
   *
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @param {object} project (optional)
   * @param {string} attachedDeposit (optional)
   * @param {string} walletId (optional)
   * @returns {object} account, keyPair
   */  
  static async createSubAccount(network, project = null, attachedDeposit = null, walletId = null) {
    const networkId = this.getNearNetworkId(network);
    // Set accountId
    let accountId;
    // if (false && !!project && !!walletId && networkId !== "testnet") {
    //   // We dont know why throw erro when create this kind of accounts!!
    //   // DISABLED
    //   accountId = `${walletId}.${project.accountId}`;
    // } else {
    //   accountId = v4();
    //   if (networkId === "testnet") {
    //     accountId += ".testnet";
    //   } else {
    //     accountId += ".near";
    //   }
    // }
    accountId = `${walletId}-${project.accountId}`;

    // Get credentials
    let credentials;
    if (!!project) {
      credentials = await this.getCredentials_PROJECT(project);
    } else {
      credentials = await this.getCredentials_MINTKNIGHT(network);
    }

    // Connect
    const connResult = await this.connectNear(network, credentials);
    if (!connResult.success) {
      return {success: false, error: connResult.error};
    }
    const senderAccountId = connResult.accountId;
    const keyStore = connResult.keyStore;
    const nearConnection = connResult.conn;

    const senderAccount = await nearConnection.account(senderAccountId);
    const keyPair = KeyPair.fromRandom("ed25519");
    const publicKey = keyPair.publicKey.toString();
    await keyStore.setKey(networkId, accountId, keyPair);

    /**
     * The account wouldn't have enough balance to cover storage, required to have 1820000000000000000000 yoctoNEAR more
     */
    if (!attachedDeposit) {
      // attachedDeposit = '0.00182';
      // Transfer : The account  wouldn't have enough balance to cover storage, required to have 1600864824171987354801 yoctoNEAR more
      // Total needed: 3420864824171987354801 (0,003420864824171987624013)
      // attachedDeposit = '0.00343';
      // 2023-03-02: ServerError: The account wouldn't have enough balance to cover storage, required to have 812718106034788610602 yoctoNEAR more
      // attachedDeposit = '0.005'; > 3 transfers
      // 0.1N > 64 transfers
      // 0.025 > 15 transfers
      attachedDeposit = '0.025';
    }
  
    console.log(`Creating account ${accountId} ...`);
    return new Promise((resolve) => {
      senderAccount.functionCall({
        contractId: networkId === "testnet" ? "testnet" : "near",
        methodName: "create_account",
        args: {
          new_account_id: accountId,
          new_public_key: publicKey,
        },
        gas: "300000000000000",
        attachedDeposit: utils.format.parseNearAmount(attachedDeposit),
      })
        .then( async (response) => {
          console.log(`Account ${accountId} has been created`);
          resolve({ success: true, accountId, response, keyPair, nearConnection });
        })
        .catch(error => {
          console.log('createSubAccount error', error);
          resolve({success: false, error});
        });
    });
  }

  /**
   * getCredentials_MINTKNIGHT
   *
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @returns {object} { accountId, privateKey }
   */  
  static async getCredentials_MINTKNIGHT(network) {
    const networkId = this.getNearNetworkId(network);
    // Get credentials from Mintknight account (mintknight.near)
    const accountId = networkId === "testnet" ? process.env.NEAR_TESTNET_ACCOUNT_ID : process.env.NEAR_MAINNET_ACCOUNT_ID;
    const privateKey = networkId === "testnet" ? process.env.NEAR_TESTNET_PRIVATE_KEY : process.env.NEAR_MAINNET_PRIVATE_KEY;
    return { accountId, privateKey };
  }

  /**
   * getCredentials_PROJECT
   *
   * @param {object} project
   * @returns {object} { accountId, privateKey }
   */  
  static async getCredentials_PROJECT(project) {
    const accountId = project.accountId;
    const privateKey = project.privateKey;
    return { accountId, privateKey };
  }

  /**
   * getCredentials_WALLET
   *
   * @param {object} wallet
   * @returns {object} { accountId, privateKey, address }
   */  
  static async getCredentials_WALLET(wallet) {
    const accountId = wallet.accountId;
    const privateKey = Shamir.getSeedFromSharedKeys(wallet.skey, wallet.skey1);
    const address = wallet.address;
    return { accountId, privateKey, address };
  }

  /**
   * getCredentials_MASTERWALLET
   *
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @param {number} walletIndex
   * @returns {object} { accountId, privateKey, address }
   */  
  static async getCredentials_MASTERWALLET(network, walletIndex) {
    const resultNearWallet = await this.getNearWallet(network, walletIndex, false);
    const accountId = resultNearWallet.accountId;
    const privateKey = resultNearWallet.privateKey;
    const address = resultNearWallet.address;
    return { accountId, privateKey, address };
  }

  /**
   * Connect Near
   *
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @param {object} credentials { accountId, privateKey }
   * @returns {object} Near connection
   */  
  static async connectNear(network, credentials = null) {
    const networkId = this.getNearNetworkId(network);
    let keyStore = null;
    let accountId = null;
    let privateKey = null;

    // Set config
    const config = {
      networkId,
      nodeUrl: `https://rpc.${networkId}.near.org`,
      walletUrl: `https://wallet.${networkId}.near.org`,
      helperUrl: `https://helper.${networkId}.near.org`,
      explorerUrl: `https://explorer.${networkId}.near.org`,
    };

    if (!!credentials) {
      accountId = credentials.accountId;
      privateKey = credentials.privateKey;
      // Set key store
      keyStore = new keyStores.InMemoryKeyStore();
      // creates a public / private key pair using the provided private key
      const mkKeyPair = KeyPair.fromString(privateKey);
      // adds the keyPair you created to keyStore
      await keyStore.setKey(networkId, accountId, mkKeyPair);  
      config.keyStore = keyStore;
    }

    // console.log('Connecting..');
    return new Promise((resolve) => {
      connect(config)
        .then((conn) => {
          resolve({success: true, conn, keyStore, accountId});
        })
        .catch(error => {
          console.log('connectNear error', error);
          resolve({success: false, error});
        });
    });
  }

  /**
   * Get Near Network Id
   *
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @returns {string} Near Network Id
   */  
  static getNearNetworkId(network) {
    return network === "near.testnet" ? "testnet" : "mainnet";
  }

  /**
   * Get balance account
   *
   * @param {string} accountId
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @returns {string} balance
   */  
  static async getBalance(accountId, network) {
    // Connect
    const connResult = await Near.connectNear(network);
    if (!connResult.success) {
      return 0;
    }
    const nearConnection = connResult.conn;
    const account = await nearConnection.account(accountId);
    const balance = await account.getAccountBalance();
    return utils.format.formatNearAmount(balance.available);
  }

  /**
   * Send money
   *
   * @param {string} senderAccountId
   * @param {string} receiverAccountId
   * @param {string} amount
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @param {object} credentials { accountId, privateKey }
   * @returns {object} common ret
   */  
  static async sendMoney(
    senderAccountId, 
    receiverAccountId, 
    amount, 
    network,
    credentials,
  ) {
    // Connect
    const connResult = await Near.connectNear(network, credentials);
    if (!connResult.success) {
      return connResult;
    }
    const nearConnection = connResult.conn;

    const yoctoNEAR = utils.format.parseNearAmount(amount);
    return new Promise(async (resolve) => {
      try {
        const account = await nearConnection.account(senderAccountId);
        await account.sendMoney(receiverAccountId, yoctoNEAR);
        resolve({success: true});
      } catch (error) {
        console.log('sendMoney error', error);
        resolve({success: false, error});
      }
    });
  }

  /**
   * Delete account
   * 
   * @param {string} accountId 
   * @param {string} beneficiaryAccountId 
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @param {object} credentials { accountId, privateKey }
   * @returns {object} common ret
   */
  static async deleteAccount(
    accountId, 
    beneficiaryAccountId, 
    network,
    credentials,
  ) {
    // Connect
    const connResult = await Near.connectNear(network, credentials);
    if (!connResult.success) {
      return connResult;
    }
    const nearConnection = connResult.conn;

    return new Promise(async (resolve) => {
      try {
        const account = await nearConnection.account(accountId);
        const ret = await account.deleteAccount(beneficiaryAccountId);
        resolve({success: true, data: ret});
      } catch (error) {
        console.log('deleteAccount error', error);
        resolve({success: false, error});
      }
    });
  }  

  /**
   * Call contract view
   *
   * @param {string} accountId
   * @param {string} contractId
   * @param {string} methodName
   * @param {object} args
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @returns {string} storage paid
   */  
  static async callContractView(
    accountId, 
    contractId, 
    methodName,
    args,
    network,
  ) {
    // Connect
    const connResult = await Near.connectNear(network);
    if (!connResult.success) {
      return connResult;
    }
    const nearConnection = connResult.conn;

    return new Promise(async (resolve) => {
      try {
        const account = await nearConnection.account(accountId);
        const data = await account.viewFunction(
          contractId,
          methodName,
          args,
        );
        resolve({success: true, data});
      } catch (error) {
        console.log('callContractView error', error);
        resolve({success: false, error});
      }
    });
  }

  /**
   * Call balance of (FT) account
   *
   * @param {string} accountId
   * @param {string} contractId
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @returns {string} storage paid
   */  
  static async getBalanceOf(
    accountId, 
    contractId, 
    network,
  ) {
    const result = await Near.callContractView(
      accountId, 
      contractId, 
      "ft_balance_of",
      { account_id: accountId },
      network,
    );
    if (!result.success) {
      return 0;
    }
    return result.data;
  }

  /**
   * Send tx
   * 
   * @param {string} receiverId
   * @param {Array<any>} actions
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @param {object} credentials { accountId, privateKey }
   * @returns {object} result
   */  
  static async sendContractTx(
    receiverId, 
    actions,
    network, 
    credentials,
  ) {
    // Connect
    const connResult = await this.connectNear(network, credentials);
    if (!connResult.success) {
      return {success: false, error: connResult.error};
    }
    const senderAccountId = connResult.accountId;
    const nearConnection = connResult.conn;
    const senderAccount = await nearConnection.account(senderAccountId);

    const txActions = [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      txActions.push(
        transactions.functionCall(
          action.methodName,
          Buffer.from(JSON.stringify(action.args)),
          "10000000000000",
          utils.format.parseNearAmount(action.deposit),
        ),
      );
    }

    // console.log(`Sending Tx ...`);
    return new Promise((resolve) => {
      senderAccount.signAndSendTransaction({
        receiverId,
        actions: txActions,
      })
      .then( async (response) => {
        resolve({ success: true, response });
      })
      .catch(error => {
        console.log('sendContractTx error', error);
        resolve({success: false, error});
      });
    });
  }

  /*
  * GET Token Info.
  */
  static async getTokenInfo(contract, accountId) {
    return new Promise(async (resolve) => {
      const data = {
        name: contract.name,
        symbol: contract.symbol,
        totalSupply: contract.totalSupply,
      };
      if (!!accountId) {
        const balance = await this.getBalanceOf(
          accountId, 
          contract.address, 
          contract.network, 
        );  
        data.balanceOf = balance;
        data.address = accountId;
      }
      resolve(data);
    });
  }

  /**
   * Multicall
   */
  static async multicall(task) {
    const ret = {
      success: false,
      cost: 0,
      txHash: '',
    };
    let msg, isMajorError;
    let contract, from = null, to, data = null, amount = null, nft = null;
    let credentials;
    // Set main vars
    contract = await Contract.findOne({ _id: task.contractId });
    if (!!task.wallet1) from = await WalletModel.findOne({ _id: task.wallet1 });
    to = await WalletModel.findOne({ _id: task.wallet2 });
    if (!!task.data) data = JSON.parse(task.data);
    if (!!task.nftId) nft = await Nft.findOne({ _id: mongoose.Types.ObjectId(task.nftId) });
    // Check task types
    switch (task.txType) {
      case 'mintTo':
      case 'transferFrom':
        break;
      case 'transfer':
        // Fix amount
        amount = data.amount;
        amount = amount.toString().replace(',', '.');
        amount = parseInt(amount).toString();        
        break;
      default:
        return ret;
    }
    
    // Infinite loop
    let tries = 0;
    do {
      isMajorError = false;
      try {
        // Call tx
        console.log(`(${task.walletIndex}) Start executing Multicall, TaskId: ${task._id.toString()}, Tries: ${tries}`);
        // // Get master wallet credentials
        // const mkCredentials = await Near.getCredentials_MASTERWALLET(task.network, task.walletIndex);        
        // console.log(`MK accountId: ${mkCredentials.accountId}`);
        // console.log(`MK privateKey: ${mkCredentials.privateKey}`);
        // console.log(`MK address: ${mkCredentials.address}`);
        
        // set actions
        let anyError = false;
        const actions = [];        
        if (task.txType === 'transfer') {
          // Set credentials from (subaccount)
          credentials = await this.getCredentials_WALLET(from);
          // Set action
          actions.push({
            methodName: "ft_transfer",
            args: { receiver_id: to.accountId, amount },
            // Smart contract panicked: Requires attached deposit of exactly 1 yoctoNEAR
            deposit: '0.000000000000000000000001',
          });
        } else if (task.txType === 'mintTo') {
          // Set credentials from project
          const project = await Project.findOne({ _id: mongoose.Types.ObjectId(task.projectId) });
          credentials = await this.getCredentials_PROJECT(project);
          // Get nft
          let media = await Media.findOne({ _id: mongoose.Types.ObjectId(nft.mediaId) });
          let metadata = JSON.parse(nft.metadata);
          metadata.media = media.fileUrl;
          // Upload files
          const retUpload = await this.uploadFiles(project, contract, media, nft);
          if (!retUpload.success) {
            console.log('retUpload', retUpload);
            anyError = true;
          }
          // Set action
          if (!anyError) {
            nft = retUpload.nft;
            // media = retUpload.media;
            actions.push({
              methodName: "nft_mint",
              args: { 
                receiver_id: to.accountId, 
                token_id: nft.tokenId,
                token_metadata: JSON.parse(nft.metadata)
              },
              // Smart contract panicked: Requires attached deposit of exactly 
              // 6870000000000000000000 yoctoNEAR
              // 8430000000000000000000
              // deposit: '0.006870000000000001105782',
              // 'Smart contract panicked: Must attach 8470000000000000000000 yoctoNEAR to cover storage'
              // deposit: '0.008430000000000001728062',
              // deposit: '0.0085',
              // 'Smart contract panicked: Must attach 9860000000000000000000 yoctoNEAR to cover storage'
              deposit: '0.01',
            });
            console.log('actions', actions);
            console.log('actions[0].args.token_metadata', actions[0].args.token_metadata);
          }          
        } else if (task.txType === 'transferFrom') {
          // Set credentials from (subaccount)
          credentials = await this.getCredentials_WALLET(from);
          // Set action
          actions.push({
            methodName: "nft_transfer",
            args: { 
              receiver_id: to.accountId, 
              token_id: nft.tokenId,
              memo: "transfer ownership" 
            },
            // Smart contract panicked: Requires attached deposit of exactly 1 yoctoNEAR
            deposit: '0.000000000000000000000001',
          });
          console.log('actions', actions);
        }

        // Send tx
        if (!anyError) {
          const receiverId = contract.address;
          const txResult = await Near.sendContractTx(
            receiverId, 
            actions,
            task.network, 
            credentials);
          if (txResult.success) {
            task.txHash = txResult.response.transaction.hash;
            console.log(`(${task.walletIndex}) End executing Multicall, TaskId: ${task._id.toString()}, Tries: ${tries}, txHash: ${task.txHash}`);
            await task.save();        
            ret.cost = txResult.response.transaction_outcome.outcome.gas_burnt;
            ret.txHash = task.txHash;
            // Happy end
            ret.success = true;
            return ret;
          }  
        }

      } catch (err) {
        if (!!err.code) console.log('err.code', err.code);
        if (!!err.message) {
          console.log('err.message', err.message);
          isMajorError = 
            err.message.includes("Only owner can sign transactions") ||
            err.message.includes("Token already exist") ||
            err.message.includes("Smart contract panicked") ||
            err.message.includes("transfer caller is not owner nor approved");
        } else {
          console.log('ERROR WITH NO MESSAGE', err);
        }
      }

      // Oups! there´s an error!

      // Check if it´s a major error
      if (task.txType === 'transferFrom') {
        // Check balance and send Nears to account if it´s necessary
        const balanceNeeded = 0.01;
        const balance = await this.getBalance(from.accountId, task.network);
        console.log('balance', balance, from.accountId);
        if (balance >= balanceNeeded) {
          console.log('Balance enough!');
          isMajorError = true;
        } else {
          const project = await Project.findOne({ _id: mongoose.Types.ObjectId(task.projectId) });
          const credentials = await this.getCredentials_PROJECT(project); 
          const balanceToTransfer = balanceNeeded - balance;         
          const sendMoneyResult = await Near.sendMoney(
            project.accountId, 
            from.accountId, 
            balanceToTransfer.toString(), 
            task.network,
            credentials,
          );
          console.log('sendMoneyResult', sendMoneyResult);
        }
      }
      
      console.log('isMajorError', isMajorError);
      msg = `(${task.walletIndex}) Error executing Multicall , TaskId: ${task._id.toString()}, Tries: ${tries}`;
      console.log(msg);
      if (isMajorError) {
        // Fail task
        await MailController.sendToAdmin('Error executing Multicall', msg);
        return ret;
      } else {
        // Retry again
        /*if (tries >= 100) {
          return ret;
        }*/
        // Notify by email
        if (tries === 10) await MailController.sendToAdmin('Error executing Multicall', msg);
        // Delay
        await EVM.pauseProcess(tries);
        // Check the real transaction
        // Si la crida al node falla per BAD RESPONSE, és posible que la transacció s´hagi efectuat. En aquest cas donarà error de manera perpètua.
        // Per tant, comprobarem l´estat real de la transacció
        // TODO
      }
      // Update tries
      tries++;
      task.tries = tries;
      task.tryAgainAt = new Date();
      await task.save();

    } while (true);
  }

  /**
   * Upload files
   */
  static async uploadFiles(project, contract, media, nft) {
    // Set folder to download files from AWS
    let tmpdir = `${DATAMK}/tmp-medias-${project.name}`;
    tmpdir = path.normalize(tmpdir);
    // Create locally if not exist & create dir
    if (!fs.existsSync(tmpdir)) fs.mkdirSync(tmpdir);

    // Set files
    const mediaFile = `${tmpdir}/${media.path}`;
    const metadataFile = `${tmpdir}/${nft.tokenId}.json`;

    // Rollback
    const rollbackFiles = () => new Promise((resolve) => {
      if (fs.existsSync(mediaFile)) fs.unlinkSync(mediaFile);
      if (fs.existsSync(metadataFile)) fs.unlinkSync(metadataFile);
      resolve();
    });

    // Initialize Bundlr
    const walletIndex = 1;
    let bundlrNetwork = `bundlr.mainnet`;    
    const { bundlr, address, balance } = await BundlrClient.getBundlrWallet(bundlrNetwork, walletIndex);
    if (!bundlr) {
      await rollbackFiles();
      return { success: false, msg: `Error initializing Bundlr wallet` };
    }
    console.log(`Bundlr address`, address);
    console.log(`Bundlr balance`, balance);   

    // Upload MEDIA
    if (!media.url) {
      // Download files
      if (!fs.existsSync(mediaFile)) {
        console.log(`NEAR. Downloading media to: ${mediaFile}`);
        const downloadRet = await AwsS3.download(`media/${media.path}`, `${mediaFile}`);
        if (downloadRet === false) { 
          await rollbackFiles();
          return { success: false, msg: downloadRet };
        }
      } else {
        console.log(`NEAR. Good! Media already exist: ${mediaFile}`);
      }
      // Check files
      if (!fs.existsSync(mediaFile)) {
        await rollbackFiles();
        return { success: false, msg: `${mediaFile} does not exist locally` };
      }
      // Add task.
      const task = new Task({
        projectId: project._id,
        network: contract.network,
        walletIndex,
        contractId: contract._id,
        txType: 'uploadMedia',
        startedAt: new Date(),
        data: JSON.stringify({ medias: [ media._id.toString() ] }),
      });  
      await task.save();   
      // Upload file
      const uploadRet = await BundlrClient.uploadFile(bundlr, mediaFile);
      // Update task
      task.state = uploadRet.success ? `success` : `failed`;
      task.endedAt = new Date();
      task.cost = uploadRet.cost;
      await task.save();   
      if (!uploadRet.success) {
        await rollbackFiles();
        return {success: false, msg: uploadRet.msg};
      }   
      // Update media
      media.url = uploadRet.url;
      await media.save();   
    }

    // Update NFT
    let metadata = JSON.parse(nft.metadata);
    metadata.media = media.url;       
    nft.metadata = JSON.stringify(metadata);
    await nft.save();     

    await rollbackFiles();
    return {success: true, nft, media};
  }

  /*
   * Verify address
   *
   * @param {string}  address EVM address
   */
  static isValidAddress(addr) {
    const sufix1 = '.testnet';
    // const sufix2 = '.near';
    if (addr.length <= sufix1.length) return false;
    const pieces = addr.split('.');
    if (pieces.length === 0 || pieces.length > 2) return false;
    const lastPiece = pieces[pieces.length - 1];
    if (lastPiece !== 'testnet' && lastPiece !== 'near') return false;
    return true;
  }

  /**
   *  Sign message
   *
   * @param {string} message
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @param {object} credentials { accountId, privateKey }
   * @returns {object} common ret
   */  
  static async signMessage(
    message, 
    network,
    credentials,
  ) {
    // Connect
    const connResult = await Near.connectNear(network, credentials);
    if (!connResult.success) {
      return connResult;
    }
    const mkKeyPair = connResult.mkKeyPair;
    const msg = Buffer.from(message);
    const { signature } = mkKeyPair.sign(msg);
    return {success: true, signature};
  }

  /**
   *  Verify signature
   *
   * @param {string} msg
   * @param {string} signature
   * @param {string} network | "near.testnet" or "near.mainnet"
   * @param {object} credentials { accountId, privateKey }
   * @returns {object} common ret
   */  
  static async verifySignature(
    message, 
    signature, 
    network,
    credentials,
  ) {
    // Connect
    const connResult = await Near.connectNear(network, credentials);
    if (!connResult.success) {
      return connResult;
    }
    const mkKeyPair = connResult.mkKeyPair;
    const msg = Buffer.from(message);
    const isValid = mkKeyPair.verify(msg, signature);
    return {success: isValid};
  }
};

};
