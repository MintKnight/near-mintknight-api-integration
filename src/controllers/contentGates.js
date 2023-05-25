const ethers = require('ethers');
const mongoose = require('mongoose');
// Models
const ContentGate = require('../models/contentGate');
const ContentGateChallenge = require('../models/contentGateChallenge');
const Contract = require('../models/contracts');
const Nft = require('../models/nfts');
const Wallet = require('../models/wallets');
// Utils
const { throwError } = require('../utils/error');
const Near = require('../utils/near');

class ContentGatesController {
  /**
   * Get list of all content gates
   *
   * @param {object} project
   * @returns {array} List of content gates
   */
  static async getAll(project) {
    // Get wallet tasks
    const list = await ContentGate.find({
      projectId: project._id,
    });
    return list;
  }

  /**
   * Get Content gate
   *
   * @param {object} project
   * @param {string} contentGateId
   * @returns {object} Content gate
   */
  static async getContentGate(project, contentGateId) {
    // Check content gate
    if (!mongoose.Types.ObjectId.isValid(contentGateId)) {
      throwError('Invalid Content gate Id', 0);
    }
    const contentGate = await ContentGate.findOne({
      _id: mongoose.Types.ObjectId(contentGateId),
    });
    if (!contentGate) throwError('Invalid Content gate', 0);
    if (contentGate.projectId.toString() !== project._id.toString()) {
      throwError('Unauthorized', 0);
    }
    return contentGate;
  }

  /**
   * Add a new Content gate
   *
   * @param {object} project
   * @param {object} formData
   * @returns {object} Content gate added
   */
  static async addContentGate(project, formData) {

    // Check title
    if (!formData.title) {
      throwError('Url is mandatory', 0);
    }
    // Check contract
    if (!mongoose.Types.ObjectId.isValid(formData.contractId)) {
      throwError('Invalid contract Id', 1513);
    }
    const contract = await Contract.findOne({
      _id: mongoose.Types.ObjectId(formData.contractId),
    });
    if (!contract) throwError('Invalid contract', 1514);
    if (contract.projectId.toString() !== project._id.toString()) {
      throwError('Unauthorized', 0);
    }

    // Create Content gate
    const contentGate = new ContentGate(formData);
    contentGate.projectId = mongoose.Types.ObjectId(project._id);
    await contentGate.save();

    // Returns content gate
    return contentGate;
  }  

  /**
   * Update a Content gate
   *
   * @param {object} project
   * @param {string} contentGateId
   * @param {object} formData
   * @returns {object} Content gate
   */
  static async updateContentGate(project, contentGateId, formData) {
    // Check content gate
    if (!mongoose.Types.ObjectId.isValid(contentGateId)) {
      throwError('Invalid Content gate Id', 0);
    }
    const contentGate = await ContentGate.findOne({
      _id: mongoose.Types.ObjectId(contentGateId),
    });
    if (!contentGate) throwError('Invalid Content gate', 0);
    if (contentGate.projectId.toString() !== project._id.toString()) {
      throwError('Unauthorized', 0);
    }

    // Update
    if (!!formData.title) contentGate.title = formData.title;
    if (!!formData.contractId) {
      // Check contract
      if (!mongoose.Types.ObjectId.isValid(formData.contractId)) {
        throwError('Invalid contract Id', 1513);
      }
      const contract = await Contract.findOne({
        _id: mongoose.Types.ObjectId(formData.contractId),
      });
      if (!contract) throwError('Invalid contract', 1514);
      contentGate.contractId = formData.contractId;
    }

    await contentGate.save();
    return contentGate;
  }

  /**
   * Delete Content gate
   *
   * @param {object} project
   * @param {string} contentGateId
   * @returns {object} Content gate
   */
  static async deleteContentGate(project, contentGateId) {
    // Check content gate
    if (!mongoose.Types.ObjectId.isValid(contentGateId)) {
      throwError('Invalid Content gate Id', 0);
    }
    const contentGate = await ContentGate.findOne({
      _id: mongoose.Types.ObjectId(contentGateId),
    });
    if (!contentGate) throwError('Invalid Content gate', 0);
    if (contentGate.projectId.toString() !== project._id.toString()) {
      throwError('Unauthorized', 0);
    }

    // delete content gate
    const removed = await ContentGate.deleteOne({ _id: mongoose.Types.ObjectId(contentGateId) });
    if (!removed) {
      throwError('Error removing content gate', 0);
    }

    return (contentGate);
  }

  /**
   * Get a new challenge
   *
   * @param {object} project
   * @param {string} address
   * @returns {object} Content gate challenge
   */
  static async getChallenge(project, address) {
    if (!address) {
      throwError('Invalid address', 0);
    }
    // Create a new one
    const doc = new ContentGateChallenge({
      projectId: mongoose.Types.ObjectId(project._id),
      address,
    });
    await doc.save();
    return doc._id;
  }

  /**
   * Check the content
   *
   * @param {object} project
   * @param {object} formData
   * @returns {boolean} Content is available or not
   */
  static async verifyContentGate(project, formData) {    
    // Check form
    if (!formData.address) {
      throwError('Address is mandatory', 0);
    }      
    if (!formData.nftId) {
      throwError('nftId is mandatory', 0);
    }  
    if (!formData.contentGateId) {
      throwError('contentGateId is mandatory', 0);
    }
    if (!!formData.walletId) {
      if (!mongoose.Types.ObjectId.isValid(formData.walletId)) {
        throwError('Invalid wallet Id', 0);
      }
      const wallet = await Wallet.findOne({
        _id: mongoose.Types.ObjectId(formData.walletId),
      });
      if (!wallet) throwError('Invalid wallet', 0);
      if (wallet.projectId.toString() !== project._id.toString()) {
        throwError('Unauthorized (wallet, project)', 0);
      }
    } else {
      if (!formData.signature) {
        throwError('signature is mandatory', 0);
      } 
      if (!formData.challenge) {
        throwError('challenge is mandatory', 0);
      }  
    }

    // Check content gate
    if (!mongoose.Types.ObjectId.isValid(formData.contentGateId)) {
      throwError('Invalid content gate Id', 0);
    }
    const contentGate = await ContentGate.findOne({
      _id: mongoose.Types.ObjectId(formData.contentGateId),
    });
    if (!contentGate) throwError('Invalid Content gate', 0);
    if (contentGate.projectId.toString() !== project._id.toString()) {
      throwError('Unauthorized (project)', 0);
    }
    const contractId = contentGate.contractId;

    // Check contract
    const contract = await Contract.findOne({
      _id: mongoose.Types.ObjectId(contractId),
    });
    if (!contract) throwError('Invalid contract', 1514);   

    // Check NFT
    if (!mongoose.Types.ObjectId.isValid(formData.nftId)) {
      throwError('Invalid nft Id', 0);
    }
    const nft = await Nft.findOne({
      _id: mongoose.Types.ObjectId(formData.nftId),
    });
    if (!nft) throwError('Invalid nft', 0);

    // Content gate is auth?
    if (contractId.toString() !== nft.contractId.toString()) {
      throwError('Unauthorized (nft, contract)', 0);
    }

    // Check signature
    if (!formData.walletId) {
      // Check challenge
      if (!mongoose.Types.ObjectId.isValid(formData.challenge)) {
        throwError('Invalid challenge', 0);
      }
      const contentGateChallenge = await ContentGateChallenge.findOne({
        _id: mongoose.Types.ObjectId(formData.challenge),
      });
      if (!contentGateChallenge) throwError('Challenge does not exist', 0);
      if (contentGateChallenge.projectId.toString() !== project._id.toString()) {
        throwError('Unauthorized (project)', 0);
      }
      if (contentGateChallenge.address !== formData.address) {
        throwError('Unauthorized (address)', 0);
      }
      if (contentGateChallenge.used) {
        throwError('Unauthorized (used)', 0);
      }    
      // Check signature
      const signatureData = contentGateChallenge._id.toString();

      const isNear = project.network === `near.testnet` || project.network === `near.mainnet`;
      if (isNear) {
        // Get user wallet
        const wallet = await Wallet.findOne({
          accountId: formData.address,
        });
        if (!wallet) throwError('Unauthorized', 0);
        const credentials = await Near.getCredentials_WALLET(wallet);
        // Verify
        const ret = await Near.verifySignature(
          signatureData, 
          formData.signature,
          wallet.network,
          credentials,
        );
        if (!ret.success) {
          throwError('Unauthorized. Error verifying the signature', 0);
        }        
        // Verified!!
      } else {
        const verify = ethers.utils.verifyMessage(signatureData, formData.signature);
        // console.log('verify', verify);
        if (verify !== formData.address) {
          throwError('Unauthorized. Error verifying the signature', 0);
        }
        // Verified!!
      }
      // Save
      contentGateChallenge.used = true;
      await contentGateChallenge.save();
    }

    return true;
  }
}

module.exports = ContentGatesController;