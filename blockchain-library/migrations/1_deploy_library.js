const LibrarySystem = artifacts.require("LibrarySystem");
module.exports = function (deployer) {
  deployer.deploy(LibrarySystem);
};
