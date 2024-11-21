export default class BambuUtil {

  static PrintSpeed = {
    SILENT: '1',
    STANDARD: '2',
    SPORT: '3',
    LUDICROUS: '4',
  };

  static PrintStates = {
    FAILED: 'failed',
    FINISH: 'finish',
    IDLE: 'idle',
    INIT: 'init',
    OFFLINE: 'offline',
    PAUSE: 'pause',
    PREPARE: 'prepare',
    RUNNING: 'running',
    SLICING: 'slicing',
    UNKNOWN: 'unknown',
  };

  static deepMergeInPlace(target, source) {
    if (typeof target !== 'object' || target === null) return;

    for (const key of Object.keys(source)) {
      const targetValue = target[key];
      const sourceValue = source[key];

      if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue)) {
        if (typeof targetValue !== 'object' || targetValue === null || Array.isArray(targetValue)) {
          target[key] = {}; // Initialize if target value isn't a suitable object
        }
        this.deepMergeInPlace(target[key], sourceValue); // Recursively merge nested objects
      } else {
        target[key] = sourceValue; // Overwrite primitives and arrays
      }
    }
  }

}
