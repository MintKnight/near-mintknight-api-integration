const mongoose = require('mongoose');
const ethers = require('ethers');
const logger = require('pino')();
// Models
const Task = require('../models/tasks');
const WalletModel = require('../models/wallets');
const Contract = require('../models/contracts');
const Project = require('../models/projects');
const Media = require('../models/media');
const Nft = require('../models/nfts');
const DropCode = require('../models/dropCodes');
// Utils
const EVM = require('../utils/evm');
const Near = require('../utils/near');
const Permaweb = require('../utils/arweave');
const Wallets = require('../utils/wallets');
const Helpers = require('../utils/helpers');
// Services
const Webhooks = require('../services/webhooks');

class TaskController {

  /**
  * Execute task
  *
  * @param {string} taskId | Task ID
  * @param {number} walletIndex | Master wallet index
  * @param {string} network | Network
  */
  static async executeTask(taskId, walletIndex, network) {
    if (this.getTaskProcessRunning(walletIndex, network)) {
      console.log(`Thread still running. ETH wallet: ${walletIndex}`);
      return;
    }
    this.setTaskProcessRunning(walletIndex, network, true);
    console.log(`Starting to execute task: ${taskId}. walletIndex: ${walletIndex}, ${network}`);
    const task = await Task.findOne({ _id: mongoose.Types.ObjectId(taskId) });
    let action = 'execute';
    let taskResult = {};
    let waitAlchemyWebhook = Helpers.IS_ALCHEMY_WEBHOOKS_ENABLED();

    // Find required tasks
    const data = JSON.parse(task.data);
    if (!!data.requiredTasks) {
      const requiredTasks = data.requiredTasks;
      for (let t = 0; t < requiredTasks.length; t++) {
        const rtask = requiredTasks[t];
        const ftask = await Task.findOne({ _id: rtask });
        if (!ftask || ftask.state === 'failed') {
          action = 'cancel';
          logger.error(`(${walletIndex}) Oups! we must cancel this task: ${taskId}`);
          break;
        } else if (ftask.state !== 'success') {
          action = 'skip';
        }
      }
    }

    // Is task iddle yet?
    if (action !== 'skip') {
      if (task.state === 'idle') action = 'skip';
    }

    if (action === 'cancel') {
      taskResult.success = false;
    } else if (action === 'skip') {
      console.log('Skipping task', taskId);
      await new Promise((r) => setTimeout(r, 1000 * 10));
      // Finish the process to retry again
      await this.finishTaskCompletelyAndStartAnotherOne(task);
      return;
    } else if (action === 'execute') {
      const isNear = task.network === `near.testnet` || task.network === `near.mainnet`;
      // Executing task
      task.state = 'running';
      await task.save();
      try {
        switch (task.txType) {
          case 'wallet':
            if (isNear) {          
              taskResult = await Near.deployWallet(task);
            } else {
              taskResult = await EVM.deployWallets(task);
            } 
            break;
          case 'contract':
            taskResult = await EVM.deployContract(task);
            break;
          case 'mintTo':
          case 'mint':
          case 'transferFrom':
          case 'transfer':
          case 'setDefaultRoyalty':
            if (isNear) {
              taskResult = await Near.multicall(task);
            } else {
              taskResult = await EVM.multicall(task);
            }            
            break;
          case 'metadata':
            waitAlchemyWebhook = false;
            taskResult = await Permaweb.metadata(task);
            break;
          case 'media':
            waitAlchemyWebhook = false;
            taskResult = await Permaweb.upload(task);
            break;
          default:
            taskResult.success = false;
            break;
        }
      } catch (err) {
        console.log('Error executing task', err);
        taskResult.success = false;
      }
    }

    if (!waitAlchemyWebhook || !taskResult.success) {
      // Update task
      taskResult.state = taskResult.success ? 'success' : 'failed';
      await this.updateTask(task, taskResult);
      // Finishing task without waiting the alchemy webhook
      await this.finishingTask(task);
      // Finish task completely & start another one
      await this.finishTaskCompletelyAndStartAnotherOne(task);      
    } else {
      // Update task and Wait the alchemy webhook
      await this.updateTask(task, taskResult);
    }
  }

}

module.exports = TaskController;
