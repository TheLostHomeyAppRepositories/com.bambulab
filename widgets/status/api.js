'use strict';

async function getDevice({ homey, query }) {
  const { deviceId } = query;
  const driver = homey.drivers.getDriver('cloud');
  const device = driver.getDevices().find(device => device.getData().deviceId === deviceId);
  if (!device) {
    throw new Error('Device Not Found');
  }

  return device;
}

module.exports = {
  async getStatus({ homey, query }) {
    const device = await getDevice({ homey, query });

    return {
      progressPercentage: device.getCapabilityValue('bambu_progress_percentage'),
      jobId: device.jobId,
      jobName: device.jobName,
      printState: device.printState,
      lightChamberState: device.getCapabilityValue('onoff.light_chamber'),
      printSpeedState: device.getCapabilityValue('bambu_print_speed'),
    };
  },

  async getImage({ homey, query }) {
    const device = await getDevice({ homey, query });

    return await device.jobImage.then(buf => {
      return `data:image/png;base64,${buf.toString('base64')}`;
    });
  },

  async setPrintPaused({ homey, query }) {
    const device = await getDevice({ homey, query });
    await device.setPrintPaused();
  },

  async setPrintResume({ homey, query }) {
    const device = await getDevice({ homey, query });
    await device.setPrintResume();
  },

  async setPrintStop({ homey, query }) {
    const device = await getDevice({ homey, query });
    await device.setPrintStop();
  },

  async setLightChamber({ homey, query, body }) {
    const device = await getDevice({ homey, query });

    const {
      on,
    } = body;

    await device.triggerCapabilityListener('onoff.light_chamber', on);
  },

  async setPrintSpeed({ homey, query, body }) {
    const device = await getDevice({ homey, query });

    const {
      speed,
    } = body;

    await device.triggerCapabilityListener('bambu_print_speed', speed);
  },

};
