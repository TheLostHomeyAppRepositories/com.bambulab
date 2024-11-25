import { OAuth2Device, fetch } from 'homey-oauth2app';
import mqtt from 'mqtt';

import BambuUtil from './BambuUtil.mjs';

export default class BambuDriver extends OAuth2Device {

  jobId = null;
  jobName = null;
  jobTask = null;
  jobImage = null;

  printState = null;

  async onOAuth2Init() {
    await this.connect()
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

    this.registerCapabilityListener('bambu_print_speed', async value => {
      await this.setPrintSpeed({
        speed: value,
      });
    });
  }

  async onOAuth2Uninit() {
    await this.disconnect()
      .catch(err => this.error(`Error Disconnecting: ${err.message}`));
  }

  async onOAuth2Added() {
    await this.oAuth2Client.save();
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
      if (topic !== `device/${deviceId}/report`) return;
      try {
        this.onState(JSON.parse(message))
          .catch(err => this.error(`Error Handling State: ${err.message}`));
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

    this.mqtt.on('error', err => {
      this.error(`MQTT Error: ${err.message}`);
    });

    this.mqtt.on('offline', () => {
      this.error(`MQTT Offline`);

      this.setUnavailable('Offline').catch(this.error);

      // Reconnect
      setTimeout(() => {
        Promise.resolve().then(async () => {
          await this.disconnect();
          await this.connect();
          await this.setAvailable();
        })
          .then(() => this.log('Reconnected'))
          .catch(err => this.error(`Error Reconnecting: ${err.message}`));
      }, 1000 * 10);
    });
  }

  async disconnect() {
    if (this.mqtt) {
      this.mqtt.removeAllListeners();
      this.mqtt.end();
      this.mqtt = null;
    }
  }

  async setLightChamber({
    on = true,
  }) {
    await this.publish({
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
    });
  }

  async setLightWork({
    on = true,
  }) {
    await this.publish({
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
    });
  }

  async setPrintPaused() {
    await this.publish({
      print: {
        sequence_id: '0',
        command: 'pause',
        param: '',
      },
    });
  }

  async setPrintResume() {
    await this.publish({
      print: {
        sequence_id: '0',
        command: 'resume',
        param: '',
      },
    });
  }

  async setPrintStop() {
    await this.publish({
      print: {
        sequence_id: '0',
        command: 'stop',
        param: '',
      },
    });
  }

  async setPrintSpeed({
    speed = BambuUtil.PrintSpeed.SILENT,
  }) {
    await this.publish({
      print: {
        sequence_id: '0',
        command: 'print_speed',
        param: speed,
      },
    });
  }

  async publish(obj) {
    if (!this.mqtt) {
      throw new Error('Not Connected');
    }

    await this.mqtt.publishAsync(`device/${this.getData().deviceId}/request`, JSON.stringify(obj), {
      qos: 1,
    });
  }

  async onState(state) {
    // this.log('State:', JSON.stringify(state));

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
      if (!this.hasCapability('bambu_progress_percentage')) {
        await this.addCapability('bambu_progress_percentage');
      }

      await this.setCapabilityValue('bambu_progress_percentage', progressPercent)
        .catch(this.error);
    }

    // Progress Remaining Time
    const progressRemaining = state?.print?.mc_remaining_time;
    if (typeof progressRemaining === 'number') {
      if (!this.hasCapability('bambu_progress_time_remaining')) {
        await this.addCapability('bambu_progress_time_remaining');
      }

      await this.setCapabilityValue('bambu_progress_time_remaining', `${progressRemaining} min`)
        .catch(this.error);
    }

    // Progress — Layers
    const progressLayers = state?.print?.layer_num;
    const progressLayersTotal = state?.print?.total_layer_num;
    if (typeof progressLayers === 'number' && typeof progressLayersTotal === 'number') {
      if (!this.hasCapability('bambu_print_layers')) {
        await this.addCapability('bambu_print_layers');
      }

      await this.setCapabilityValue('bambu_print_layers', `${progressLayers} / ${progressLayersTotal}`)
        .catch(this.error);
    }

    // Job
    if (state?.print?.job_id) {
      const previousJobId = this.jobId;
      this.jobId = state?.print?.job_id;

      // Fetch Job Task
      if (this.jobId !== previousJobId) {
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

    if (state?.print?.subtask_name) {
      this.jobName = state?.print?.subtask_name;
    }

    // Print State
    if (state?.print?.gcode_state) {
      if (this.printState !== state.print.gcode_state) {
        const previousPrintState = this.printState;
        this.printState = state.print.gcode_state;

        this.log(`New Print State: ${this.printState}`);

        // Start Flows
        if (previousPrintState !== null) {
          if (this.printState === BambuUtil.PrintStates.FAILED) {
            this.homey.flow
              .getDeviceTriggerCard('print_state_failed')
              .trigger()
              .catch(this.error);
          }

          if (this.printState === BambuUtil.PrintStates.FINISH) {
            this.homey.flow
              .getDeviceTriggerCard('print_state_finish')
              .trigger()
              .catch(this.error);
          }

          if (this.printState === BambuUtil.PrintStates.PAUSE) {
            this.homey.flow
              .getDeviceTriggerCard('print_state_paused')
              .trigger()
              .catch(this.error);
          }

          if (this.printState === BambuUtil.PrintStates.RUNNING) {
            this.homey.flow
              .getDeviceTriggerCard('print_state_running')
              .trigger()
              .catch(this.error);
          }
        }
      }
    }

    // Print Speed
    const printSpeed = state?.print?.spd_lvl;
    if (typeof printSpeed === 'number') {
      if (!this.hasCapability('bambu_print_speed')) {
        await this.addCapability('bambu_print_speed');
      }

      await this.setCapabilityValue('bambu_print_speed', String(printSpeed))
        .catch(this.error);
    }
  }

}
