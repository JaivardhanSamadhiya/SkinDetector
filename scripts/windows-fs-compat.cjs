// Some Windows virtual workspace volumes return EISDIR for readlink on a
// regular file. Next's trace resolver expects EINVAL for a non-symlink.
// Normalize only that verified case; preserve real symlinks and all other errors.
const fs = require('node:fs');
if (process.platform === 'win32') {
  const originalSync = fs.readlinkSync;
  const originalAsync = fs.readlink;
  const originalPromise = fs.promises.readlink;
  function normalize(error, path) {
    if (error?.code !== 'EISDIR') return error;
    try {
      if (!fs.lstatSync(path).isSymbolicLink()) {
        error.code = 'EINVAL';
        error.message = error.message.replace('EISDIR: illegal operation on a directory', 'EINVAL: invalid argument');
      }
    } catch { /* Preserve the original filesystem error if inspection fails. */ }
    return error;
  }
  fs.readlinkSync = function(path, ...options) {
    try { return originalSync.call(fs, path, ...options); }
    catch (error) { throw normalize(error, path); }
  };
  fs.readlink = function(path, ...options) {
    if (typeof options.at(-1) !== 'function') return originalAsync.call(fs, path, ...options);
    const callback = options.pop();
    return originalAsync.call(fs, path, ...options, (error, result) => callback(normalize(error, path), result));
  };
  fs.promises.readlink = async function(path, ...options) {
    try { return await originalPromise.call(fs.promises, path, ...options); }
    catch (error) { throw normalize(error, path); }
  };
}
