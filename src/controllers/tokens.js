const mongoose = require('mongoose');
const ethers = require('ethers');
// Controllers
const TaskController = require('./tasks');
const WalletController = require('./wallets');
// Models
const Contract = require('../models/contracts');
const Wallet = require('../models/wallets');
const Task = require('../models/tasks');
// Utils
const EVM = require('../utils/evm');
const Near = require('../utils/near');
const securityCheck = require('../utils/security');

class TokenController {

  /**
   * Get token info
   *
   * @param {string} contractId
   * @param {string} walletId
   * @returns {string} Token name
   * @returns {string} symbol
   * @returns {number} totalSupply
   * @returns {number} balanceOf
   * 
   */  
  static async getTokenInfo(contractId, walletId) {
    const contract = await Contract.findOne({ _id: mongoose.Types.ObjectId(contractId) });
    if (!contract) throw (new Error('Invalid contract Id'));
    const wallet = await Wallet.findOne({ _id: mongoose.Types.ObjectId(walletId) });
    if (!wallet) throw (new Error('Invalid wallet Id'));
    const isNear = contract.network === `near.testnet` || contract.network === `near.mainnet`;
    let tokenInfo;
    if (isNear) {
      if (!wallet.accountId) throw (new Error('Invalid account'));
      tokenInfo = await Near.getTokenInfo(contract, wallet.accountId);
    } else {
      if (!EVM.isValidAddress(wallet.address)) throw (new Error('Invalid address'));
      tokenInfo = await EVM.getTokenInfo(contract, wallet.address);
    }
    return tokenInfo;
  }

  /**
   * Get balance
   *
   * @param {string} contractId
   * @param {string} walletId
   * @returns {number} balanceOf
   * 
   */  
  static async getBalance(contractId, walletId) {
    const tokenInfo = await this.getTokenInfo(contractId, walletId);
    return !!tokenInfo.balanceOf ? tokenInfo.balanceOf.toString() : `0.0`;
  }

  /**
   * Transfer amount of tokens
   *
   * @param {object} context
   * @param {object} formData
   * @returns {object} Task ID
   */
  static async transfer(context, formData) {
    const { contract, from, to } = await securityCheck(context, formData, 'transfer');
    // Check
    if (context.project.transfersAvailable <= context.project.transfersUsed) throw (new Error(`Transfers have reached the limit (${context.project.transfersAvailable}/${context.project.transfersUsed}). Please upgrade`));
    if (contract.status !== 'onchain') throw (new Error('Contract is not deployed yet'));
    const isNear = context.project.network === `near.testnet` || context.project.network === `near.mainnet`;
    // Check balance
    let tokenInfo;
    if (isNear) {
      tokenInfo = await Near.getTokenInfo(contract, from.accountId);
    } else {
      tokenInfo = await EVM.getTokenInfo(contract, from.address);
    }
    const amount = parseFloat(formData.value);
    console.log(`Amount to transfer`, amount);
    console.log(`tokenInfo`, tokenInfo);
    if (tokenInfo.balanceOf <= amount) throw (new Error(`Not enough balance to transfer. Balance: ${tokenInfo.balanceOf}`));
    // Cooking task
    const action = 'transfer';
    const updatingData = {};
    const taskData = {
      contractId: contract._id,
      wallet1: from._id,
      wallet2: to._id,
    };
    let walletIndex;
    let task;
    if (isNear) {
      taskData.data = JSON.stringify({
        amount: formData.value,
      }),
      walletIndex = await TaskController.getWalletIndex(context.project.network, action, taskData);
      task = await TaskController.createTask(action, context.project, taskData, walletIndex);
    } else {
      // Check wallet
      const skey = !!formData.skey ? formData.skey : from.skey1;
      if (!skey) throw (new Error(`Invalid Wallet. skey1 is needed`));
      // Create task tx & Sign tx
      const amount2Send = ethers.utils.parseEther(formData.value);
      // Must be atomic: (Create task + update nonce)
      // *****************
      walletIndex = await TaskController.getWalletIndex(context.project.network, action, taskData);
      await WalletController.lockWallet(from._id.toString(), walletIndex);
      task = await TaskController.createTask(action, context.project, taskData, walletIndex);
      const nonce = await EVM.updateNonce(task.walletIndex, from._id, from.isMultiNonce);
      await WalletController.unlockWallet(from._id.toString(), walletIndex);
      // *****************
      const payload = { 
        toAddress: to.address, 
        amount: amount2Send
      };
      const result = await EVM.signTask(
        from, 
        skey, 
        contract.contractType, 
        action, 
        payload, 
        task, 
        nonce);    
      if (result === false) {
        // Important! delete iddle task
        if (!!task) await Task.deleteOne({ _id: mongoose.Types.ObjectId(task._id) });
        throw (new Error('Error signing Tx transfering tokens'));
      }
      // Update & Launching task
      updatingData.contents = JSON.stringify(result.contents);
      updatingData.signatures = JSON.stringify(result.signatures);
    }

    // Add task to queue
    const taskId = task._id;
    await TaskController.queueupTask(taskId, updatingData);
    return { taskId };
  }
}

module.exports = TokenController;
