import { OAuth2Device, fetch } from 'homey-oauth2app';
import mqtt from 'mqtt';

import BambuUtil from './BambuUtil.mjs';

export default class BambuDriver extends OAuth2Device {

  state = {};

  jobId = null;
  jobTask = null;
  jobImage = null;

  async onOAuth2Init() {
    this.connect()
      .then(() => {
        this.setAvailable();
      })
      .catch(err => {
        this.error(`Error Connecting: ${err.message}`);
        this.setUnavailable(err).catch(err => this.error(err));
      });

    this.registerCapabilityListener('onoff.light_chamber', async value => {
      await this.setLightChamber({
        on: !!value,
      });
    });

    this.registerCapabilityListener('onoff.light_work', async value => {
      await this.setLightWork({
        on: !!value,
      });
    });

    // Set Image
    this.image = await this.homey.images.createImage();
    this.image.setStream(async stream => {
      if (!this.jobImage) {
        throw new Error('No Job Image');
      }

      const jobImageBuffer = await this.jobImage;

      stream.write(jobImageBuffer);
      stream.end();
    });

    await this.setCameraImage('job', 'Job', this.image);
  }

  async onOAuth2Added() {
    this.oAuth2Client.save();
  }

  async connect() {
    const {
      deviceId,
      userId,
    } = this.getData();

    // Connect
    this.log('Connecting...');
    this.mqtt = await mqtt.connectAsync('mqtts://us.mqtt.bambulab.com', {
      username: `u_${userId}`,
      password: this.oAuth2Client.getToken().access_token,
    });
    this.log('Connected');

    // Subscribe
    this.log('Subscribing...');
    await this.mqtt.subscribeAsync(`device/${deviceId}/report`);
    this.log('Subscribed');

    // Handle Messages
    this.mqtt.on('message', (topic, message) => {
      try {
        BambuUtil.deepMergeInPlace(this.state, JSON.parse(message));
        this.onState(this.state).catch(err => this.error(`Error Handling State: ${err.message}`));
      } catch (err) {
        this.error(`Error Handling Message: ${err.message}`);
      }
    });

    // Request Full Status
    this.log('Requesting Full Status...');
    await this.mqtt.publishAsync(`device/${deviceId}/request`, JSON.stringify({
      pushing: {
        sequence_id: '0',
        command: 'pushall',
        version: 1,
        push_target: 1,
      },
    }));
  }

  async onOAuth2Uninit() {
    if (this.mqtt) {
      this.mqtt.end();
      this.mqtt = null;
    }
  }

  async setLightChamber({
    on = true,
  }) {
    if (!this.mqtt) {
      throw new Error('Not Connected');
    }

    await this.mqtt.publishAsync(`device/${this.getData().deviceId}/request`, JSON.stringify({
      system: {
        sequence_id: '0',
        command: 'ledctrl',
        led_node: 'chamber_light',
        led_mode: on
          ? 'on'
          : 'off',
        led_on_time: 500,
        led_off_time: 500,
        loop_times: 1,
        interval_time: 1000,
      },
    }));
  }

  async setLightWork({
    on = true,
  }) {
    if (!this.mqtt) {
      throw new Error('Not Connected');
    }

    await this.mqtt.publishAsync(`device/${this.getData().deviceId}/request`, JSON.stringify({
      system: {
        sequence_id: '0',
        command: 'ledctrl',
        led_node: 'work_light',
        led_mode: on
          ? 'on'
          : 'off',
        led_on_time: 500,
        led_off_time: 500,
        loop_times: 1,
        interval_time: 1000,
      },
    }));
  }

  async onState(state) {
    // this.log('State:', JSON.stringify(state, false, 2));

    // Chamber Light
    const lightChamber = state?.print?.lights_report?.find(light => light.node === 'chamber_light');
    if (lightChamber) {
      if (!this.hasCapability('onoff.light_chamber')) {
        await this.addCapability('onoff.light_chamber');
        await this.setCapabilityOptions('onoff.light_chamber', {
          title: 'Chamber Light',
        });
      }

      await this.setCapabilityValue('onoff.light_chamber', lightChamber.mode === 'on')
        .catch(this.error);
    }

    // Work Light
    const lightWork = state?.print?.lights_report?.find(light => light.node === 'work_light');
    if (lightWork) {
      if (!this.hasCapability('onoff.light_work')) {
        await this.addCapability('onoff.light_work');
        await this.setCapabilityOptions('onoff.light_work', {
          title: 'Work Light',
        });
      }

      await this.setCapabilityValue('onoff.light_work', lightWork.mode === 'on')
        .catch(this.error);
    }

    // Temperature — Nozzle
    const temperatureNozzle = state?.print?.nozzle_temper;
    if (typeof temperatureNozzle === 'number') {
      if (!this.hasCapability('measure_temperature.nozzle')) {
        await this.addCapability('measure_temperature.nozzle');
        await this.setCapabilityOptions('measure_temperature.nozzle', {
          title: 'Nozzle Temperature',
        });
      }

      await this.setCapabilityValue('measure_temperature.nozzle', temperatureNozzle)
        .catch(this.error);
    }

    // Temperature — Bed
    const temperatureBed = state?.print?.bed_temper;
    if (typeof temperatureBed === 'number') {
      if (!this.hasCapability('measure_temperature.bed')) {
        await this.addCapability('measure_temperature.bed');
        await this.setCapabilityOptions('measure_temperature.bed', {
          title: 'Bed Temperature',
        });
      }

      await this.setCapabilityValue('measure_temperature.bed', temperatureBed)
        .catch(this.error);
    }

    // Temperature — Chamber
    const temperatureChamber = state?.print?.chamber_temper;
    if (typeof temperatureChamber === 'number') {
      if (!this.hasCapability('measure_temperature.chamber')) {
        await this.addCapability('measure_temperature.chamber');
        await this.setCapabilityOptions('measure_temperature.chamber', {
          title: 'Chamber Temperature',
        });
      }

      await this.setCapabilityValue('measure_temperature.chamber', temperatureChamber)
        .catch(this.error);
    }

    // Progress Percentage
    const progressPercent = state?.print?.mc_percent;
    if (progressPercent) {
      if (!this.hasCapability('bambu_number.progress')) {
        await this.addCapability('bambu_number.progress');
        await this.setCapabilityOptions('bambu_number.progress', {
          title: 'Progress',
          units: '%',
        });
      }

      await this.setCapabilityValue('bambu_number.progress', progressPercent)
        .catch(this.error);
    }

    // Progress Remaining Time
    const progressRemaining = state?.print?.mc_remaining_time;
    if (progressRemaining) {
      if (!this.hasCapability('bambu_string.remaining')) {
        await this.addCapability('bambu_string.remaining');
        await this.setCapabilityOptions('bambu_string.remaining', {
          title: 'Remaining Time',
        });
      }

      await this.setCapabilityValue('bambu_string.remaining', `${progressRemaining} min`)
        .catch(this.error);
    }

    // Progress — Layers
    const progressLayers = state?.print?.layer_num;
    const progressLayersTotal = state?.print?.total_layer_num;
    if (progressLayers && progressLayersTotal) {
      if (!this.hasCapability('bambu_string.layers')) {
        await this.addCapability('bambu_string.layers');
        await this.setCapabilityOptions('bambu_string.layers', {
          title: 'Layers',
        });
      }

      await this.setCapabilityValue('bambu_string.layers', `${progressLayers} / ${progressLayersTotal}`)
        .catch(this.error);
    }

    // Job
    if (this.jobId !== state?.print?.job_id) {
      this.jobId = state?.print?.job_id;
      this.jobTask = await this.oAuth2Client.getTasks({
        deviceId: this.getData().deviceId,
      })
        .then(tasks => {
          const task = tasks.find(task => String(task.id) === String(this.jobId));
          if (!task) return null;

          // Download the Cover
          if (task.cover) {
            this.jobImage = fetch(task.cover)
              .then(res => {
                if (!res.ok) throw new Error(`Error Downloading Cover: ${res.statusText}`);
                return res.buffer();
              });
            this.jobImage.catch(err => this.error(`Error Downloading Cover: ${err.message}`));
          }

          return task;
        })
        .catch(err => {
          this.error(`Error Getting Task: ${err.message}`);
          return null;
        });
    }
  }

}
