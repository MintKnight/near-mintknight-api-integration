const { v4 } = require('uuid');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
// Controllers
const TaskController = require('./tasks');
const MediaController = require('./media');
const WalletController = require('./wallets');
// Models
const Contract = require('../models/contracts');
const Task = require('../models/tasks');
const Media = require('../models/media');
const Nft = require('../models/nfts');
const Wallet = require('../models/wallets');
// Utils
const EVM = require('../utils/evm');
const Helpers = require('../utils/helpers');
const securityCheck = require('../utils/security');
const ImageUtils = require('../utils/image');
const { throwError } = require('../utils/error');
const AwsS3 = require('../utils/awsS3');
const Near = require('../utils/near');

const DATAMK = Helpers.getDATAMK();

class NftController {
  /**
   * Add NFT
   *
   * @param {object} context
   * @param {object} walletInfo {walletType, refUser}
   * @returns {object} Wallet
   * @returns {object} skeys
   */
  static async addNFT(context, formData, file) {
    const network = context.project.network;
    const isNear = network === `near.testnet` || network === `near.mainnet`;
    if (isNear) {
      return await this.addNFT_NEAR(context, formData);
    } else {
      return await this.addNFT_EVM(formData, file);
    }    
  }

  /**
   * Transfer an NFT
   *
   * @param {object} context
   * @param {string} nftId | NFT ID
   * @param {object} formData | Mint body params
   * @returns {string} TaskId
   * @returns {object} nft | NFT model
   */
  static async transfer(context, nftId, _formData) {
    const formData = { ..._formData, nftId };
    const {
      contract,
      from,
      to,
      nft,
    } = await securityCheck(context, formData);
    const isNear = context.project.network === `near.testnet` || context.project.network === `near.mainnet`;

    // Checks
    if (!from) throwError('Address (from) is not valid', 0);   
    if (!to) throwError('Address (to) is not valid', 0);     
    if (!nft) throwError('Invalid NFT Id', 5506);
    if (context.project.transfersAvailable <= context.project.transfersUsed) {
      throwError(`NFTs have reached the limit (${context.project.transfersAvailable}/${context.project.transfersUsed}). Please upgrade`, 5507);
    }
    if (contract.status !== 'onchain') throwError('Contract is not deployed yet', 5531);
    if (nft.state !== 'minted') throwError('NFT has not been minted yet', 5529);
    if (isNear) {
      if (from.network !== `near.testnet` && from.network !== `near.mainnet`) {
        throwError('Wallet (from) is not a Near account', 0);
      }
      if (to.network !== `near.testnet` && to.network !== `near.mainnet`) {
        throwError('Wallet (to) is not a Near account', 0);
      }
      if (from.accountId == to.accountId) throwError('Wallets must be diferent', 0);
      const result = await Near.callContractView(
        from.accountId, 
        contract.address, 
        "nft_tokens_for_owner",
        { account_id: from.accountId },
        context.project.network,
      );
      if (!result.success) throwError("Error getting 'nft_tokens_for_owner'", 0);
      // Find NFT
      const found = result.data.find((n) => n.token_id == nft.tokenId);
      if (!found) throwError("Wallet is not the owner of the NFT", 0);
      // Check pending transfer
      const pending = await Task.findOne({$and: [
        { network: context.project.network },
        { $or: [{ state: 'idle' }, { state: 'queued' }, { state: 'running' }] },
        { wallet1: from._id},
        { contractId: contract._id},
      ]});        
      if (!!pending) throwError("There is still a pending transfer in this wallet", 0);
    }

    // Cooking task
    const updatingData = {};
    const action = 'transferFrom';
    const taskData = {
      contractId: nft.contractId,
      nftId: nft._id,
      wallet1: from._id,
      wallet2: to._id,
    };
    let walletIndex;
    let task;
    if (!isNear) {
      // Create task tx & Sign tx
      // Must be atomic: (Create task + update nonce)
      // *****************
      walletIndex = await TaskController.getWalletIndex(context.project.network, action, taskData);
      await WalletController.lockWallet(from._id.toString(), walletIndex);
      task = await TaskController.createTask(action, context.project, taskData, walletIndex);
      const nonce = await EVM.updateNonce(task.walletIndex, from._id, from.isMultiNonce);
      await WalletController.unlockWallet(from._id.toString(), walletIndex);
      // *****************
      const payload = { 
        fromAddress: from.address, 
        toAddress: to.address, 
        tokenId: nft.tokenId 
      };
      const result = await EVM.signTask(
        from, 
        formData.skey, 
        contract.contractType, 
        action, 
        payload, 
        task, 
        nonce);    
      if (result === false) {
        // Important! delete iddle task
        if (!!task) await Task.deleteOne({ _id: mongoose.Types.ObjectId(task._id) });
        throw (new Error('Error signing Tx transfering a NFT'));
      }
      // Update & Launching task
      updatingData.contents = JSON.stringify(result.contents);
      updatingData.signatures = JSON.stringify(result.signatures);
    } else {
      walletIndex = await TaskController.getWalletIndex(context.project.network, action, taskData);
      task = await TaskController.createTask(action, context.project, taskData, walletIndex);
    }

    // Add task to queue
    const taskId = task._id;
    await TaskController.queueupTask(taskId, updatingData);

    return { taskId, nft };
  }

  /**
   * Mint NFT to Near
   *
   * @param {object} context
   * @param {object} formData | NFT Information
   *      contractId
   *      type: "EMBASSADOR" or "CARD "
   *      background
   *      avatar
   *      hologram
   *      frame
   * @param {file} file | Uploaded media or file
   * @returns {object} NFT
   */
  static async addNFT_NEAR(context, formData) {
    // Check contract
    if (!mongoose.Types.ObjectId.isValid(formData.contractId)) throwError('Invalid Contract Id', 5500);
    const contract = await Contract.findOne({ _id: mongoose.Types.ObjectId(formData.contractId) });
    if (!contract) throwError('Invalid Contract Id', 5500);
    // Check basic params
    if (!formData.to) {
      throwError('Wallet is not defined', 0);
    }
    if (!formData.mint || formData.mint.toString() != 'true') {
      throwError('mint param must be true', 0);
    }
    // Check wallet
    if (!mongoose.Types.ObjectId.isValid(formData.to)) throwError('Invalid Wallet Id', 0);
    const walletTo = await Wallet.findOne({ _id: mongoose.Types.ObjectId(formData.to) });
    if (!walletTo) throwError('Invalid Wallet Id', 5500);
    if (walletTo.network !== `near.testnet` && walletTo.network !== `near.mainnet`) {
      throwError('Wallet belongs to Invalid network', 0);
    }
    // Check medias
    if (!formData.background) {
      throwError('Background image is not defined', 0);
    }
    // Download medias
    const mediasToDownload = [];
    const getMedia = (imageName) => new Promise( async (resolve) => {
      const media = await Media.findOne({ 
        projectId: mongoose.Types.ObjectId(contract.projectId),
        name: imageName,
      });
      resolve(media);
    });
    // Add background
    let mediaName = `${formData.background}.png`;
    let media = await getMedia(mediaName);
    if (!media) throwError(`Media ${mediaName} is not uploaded`, 0);
    mediasToDownload.push(media);
    // Add avatar
    if (!!formData.avatar) {
      mediaName = `${formData.avatar}.png`;
      media = await getMedia(mediaName);
      if (!media) throwError(`Media ${mediaName} is not uploaded`, 0);
      mediasToDownload.push(media);
    }
    // Add hologram
    if (!!formData.hologram) {
      mediaName = `${formData.hologram}.png`;
      media = await getMedia(mediaName);
      if (!media) throwError(`Media ${mediaName} is not uploaded`, 0);
      mediasToDownload.push(media);
    }
    // Add frame
    let mediaFrame = null;
    if (!!formData.frame) {
      mediaName = `${formData.frame}.png`;
      media = await getMedia(mediaName);
      if (!media) throwError(`Media ${mediaName} is not uploaded`, 0);
      mediasToDownload.push(media);
      mediaFrame = media;
    }
    
    // Set folder to download files from AWS
    let tmpdir = `${DATAMK}/tmp-medias-${context.project.name}`;
    tmpdir = path.normalize(tmpdir);
    // Create locally if not exist & create dir
    if (!fs.existsSync(tmpdir)) fs.mkdirSync(tmpdir);
  
    // Download files
    const mediaFiles = [];
    for (let i = 0; i < mediasToDownload.length; i++) { 
      const media = mediasToDownload[i];
      const mediaFile = `${tmpdir}/${media.path}`;
      if (!fs.existsSync(mediaFile)) {
        console.log(`Downloading media to: ${mediaFile}`);
        const downloadRet = await AwsS3.download(`media/${media.path}`, `${mediaFile}`);
        if (downloadRet === false) { 
          throwError(downloadRet, 0);
        }
      } else {
        console.log(`Good! Media already exist: ${mediaFile}`);
      }
      mediaFiles.push(mediaFile)
    }
    
    // Mix images
    console.log('mediaFiles', mediaFiles);
    const buffer = await ImageUtils.overlapImage_JIMP(mediaFiles);
    // Write mixed image locally
    const mixedMediaPath = `jungly-${v4()}.png`;
    const mixedFile = `${tmpdir}/${mixedMediaPath}`;
    console.log('mixedFile', mixedFile);
    const rollbackFiles = () => new Promise((resolve) => {
      // if (fs.existsSync(mixedFile)) fs.unlinkSync(mixedFile); // -> It´ll remove the file before minting
      if (!!mediaFrame) {
        const mediaFrameFile = `${tmpdir}/${mediaFrame.path}`;
        console.log('Deleting', mediaFrameFile);
        if (fs.existsSync(mediaFrameFile)) fs.unlinkSync(mediaFrameFile);
      }
      resolve();
    });
    let imgInfo;
    try {
      // fs.writeFileSync(mixedFile, buffer);
      buffer.write(mixedFile);
      imgInfo = await ImageUtils.getBasicInfo(mixedFile);
    } catch (err) {
      await rollbackFiles();
      throwError(`Error writing image locally: ${err}`, 0);
    }    
    // Upload image
    try {
      await AwsS3.uploadFile(mixedFile, mixedMediaPath, 'media');
    } catch (err) {
      await rollbackFiles();
      throwError(`Error uploading file: ${err}`, 3504);
    }
    // Add media
    const mediaObj = {
      name: mixedMediaPath,
      mimetype: imgInfo.mimetype,
      size: imgInfo.filesize,
      path: mixedMediaPath,
      projectId: contract.projectId,
    };
    if (!!imgInfo.width) mediaObj.width = imgInfo.width;
    if (!!imgInfo.height) mediaObj.height = imgInfo.height;
    const newMedia = new Media(mediaObj);
    await MediaController.addFileUrl(newMedia);
    await newMedia.save();

    let name;
    let description = '';
    if (!!formData.title) {
      name = formData.title;
    } else {
      name = `Jungly`;
      if (!!formData.type) name += ' ' + formData.type;
    }
    if (!!formData.description) description = formData.description;

    const mediaId = newMedia._id;
    const metadata = {
      title: name,
      description,
      copies: 1,
    };
    if (!!formData.description) metadata.description = formData.description;

    // Add NFT
    const nft = new Nft({
      contractId: contract._id,
      mediaId,
      media: mediaId, // Populate
      metadata: JSON.stringify(metadata),
      name,
    });
    const tokenId = `jungly-${nft._id}`;
    nft.tokenId = tokenId;
    await nft.save();  

    // Cooking task
    const action = 'mintTo';
    const taskData = {
      contractId: contract._id,
      nftId: nft._id,
      wallet2: walletTo._id,
      data: JSON.stringify({
        tokenId
      }),
    };
    const walletIndex = 3;
    // Add task to queue
    const taskId = await TaskController.addTask(action, context.project, taskData, walletIndex); 
    
    await rollbackFiles();
    return { taskId, nft, media: newMedia };
  }
}

module.exports = NftController;
