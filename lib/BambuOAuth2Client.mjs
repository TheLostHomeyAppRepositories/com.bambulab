import dns from 'dns';
import http from 'http';
import https from 'https';

import {
  OAuth2Client,
  OAuth2Error,
  fetch,
} from 'homey-oauth2app';

export default class BambuOAuth2Client extends OAuth2Client {

  static CLIENT_ID = '';
  static CLIENT_SECRET = '';

  static API_URL = 'https://api.bambulab.com';
  static TOKEN_URL = 'https://api.bambulab.com/v1/user-service/user/login';
  static AUTHORIZATION_URL = null;

  httpAgent = new http.Agent({
    keepAlive: true,
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, {
        ...options,
        family: 4,
      }, callback);
    }
  });

  httpsAgent = new https.Agent({
    keepAlive: true,
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, {
        ...options,
        family: 4,
      }, callback);
    }
  });

  async onBuildRequest(...props) {
    const {
      url,
      opts,
    } = await super.onBuildRequest(...props);

    return {
      url,
      opts: {
        ...opts,
        agent: (_parsedURL) => {
          if (_parsedURL.protocol == 'http:') {
            return this.httpAgent;
          } else {
            return this.httpsAgent;
          }
        },
      },
    }
  }

  async requestCode({
    email,
  }) {
    const res = await fetch(`${this._apiUrl}/v1/user-service/user/sendemail/code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: String(email),
        type: 'codeLogin',
      }),
    });

    if (!res.ok) {
      throw new OAuth2Error(res.statusText);
    }
  }

  async loginWithEmailAndCode({
    email,
    code,
  }) {
    const res = await fetch(`${this._apiUrl}/v1/user-service/user/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account: String(email),
        code: String(code),
      }),
    });

    const result = await res.json().catch(err => {
      return { error: res.statusText };
    });

    if (result.error) {
      throw new OAuth2Error(result.error);
    }

    if (!result.accessToken) {
      throw new OAuth2Error('Missing Access Token');
    }

    this._token = new this._tokenConstructor({
      ...this._token,
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: result.expiresIn,
    });

    return this.getToken();
  }

  async getProfile() {
    return this.get({
      path: '/v1/user-service/my/profile',
    });
  }

  async getDevices() {
    const result = await this.get({
      path: '/v1/iot-service/api/user/bind',
    });

    if (result.error) {
      throw new Error(result.error);
    }

    return result.devices;
  }

  async getDeviceTtcode({
    deviceId,
  }) {
    return this.post({
      path: '/v1/iot-service/api/user/ttcode',
      json: {
        dev_id: String(deviceId),
      },
    });
  }

  async getDeviceVersion({
    deviceId,
  }) {
    return this.get({
      path: `/v1/iot-service/api/user/device/version?dev_id=${deviceId}`,
    });
  }

  async getTasks({
    deviceId,
    limit = 10,
  }) {
    const result = await this.get({
      path: `/v1/user-service/my/tasks?deviceId=${deviceId}&limit=${limit}`,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    return result.hits;
  }

  async getProjects() {
    return this.get({
      path: '/v1/iot-service/api/user/project',
    });
  }


}
