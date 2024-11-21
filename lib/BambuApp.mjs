import { OAuth2App } from 'homey-oauth2app';
import BambuOAuth2Client from './BambuOAuth2Client.mjs';

export default class BambuApp extends OAuth2App {

  static OAUTH2_CLIENT = BambuOAuth2Client;
  static OAUTH2_DEBUG = true;

  async onOAuth2Init() {
    try {
      this.homey.dashboards
        .getWidget('status')
        .registerSettingAutocompleteListener('device', async (query, settings) => {
          const driver = await this.homey.drivers.getDriver('cloud');
          const devices = await driver.getDevices();

          return Object.values(devices)
            .map(device => ({
              deviceId: device.getData().deviceId,
              name: device.getName(),
            }))
            .filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
        });
    } catch (err) {
      this.log(`Dashboards might not be available: ${err.message}`);
    }
  }

}
