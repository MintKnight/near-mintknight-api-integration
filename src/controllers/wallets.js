// Controllers
const TaskController = require('./tasks');
// Models
const WalletModel = require('../models/wallets');


class WalletController {
  /**
   * Add a new wallet
   *
   * @param {object} context
   * @param {object} walletInfo {walletType, refUser}
   * @returns {object} Wallet
   * @returns {object} skeys
   */
  static async addWallet(context, walletInfo) {
    const network = context.project.network;
    const isNear = network === `near.testnet` || network === `near.mainnet`;
    if (isNear) {
      return await this.addWallet_NEAR(context, walletInfo);
    } else {
      return await this.addWallet_EVM(context, walletInfo);
    }    
  }
  
  /**
   * Add a new ETH wallet & Save into DB
   *
   * @param {object} context
   * @param {object} walletInfo {walletType, refUser}
   * @returns {object} Wallet
   * @returns {object} skeys
   */
  static async addWallet_NEAR(context, walletInfo) {
    const wallet = new WalletModel({
      projectId: context.project._id,
      type: 'onchain',
      network: context.project.network,
      refUser: walletInfo.refUser || '',
    });
    // Save
    await wallet.save();
    // Launch task to deploy the wallet.
    const taskId = await TaskController.addTask('wallet', context.project, { wallet1: wallet._id });
    return {
      taskId, walletId: wallet._id.toString()
    };   
  }
}

module.exports = WalletController;
