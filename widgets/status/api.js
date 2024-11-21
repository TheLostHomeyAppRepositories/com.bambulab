'use strict';

module.exports = {
  async getStatus({ homey, query }) {
    const { deviceId } = query;
    const driver = homey.drivers.getDriver('cloud');
    const device = driver.getDevices().find(device => device.getData().deviceId === deviceId);
    if (!device) {
      throw new Error('Device Not Found');
    }

    return {
      progressPercentage: device.getCapabilityValue('bambu_number.progress'),
      jobId: device.jobId,
      jobName: device.jobName,
      printState: device.printState,
    };
  },

  async getImage({ homey, query }) {
    const { deviceId } = query;
    const driver = homey.drivers.getDriver('cloud');
    const device = driver.getDevices().find(device => device.getData().deviceId === deviceId);
    if (!device) {
      throw new Error('Device Not Found');
    }

    return await device.jobImage.then(buf => {
      return `data:image/png;base64,${buf.toString('base64')}`;
    });
  },
};
