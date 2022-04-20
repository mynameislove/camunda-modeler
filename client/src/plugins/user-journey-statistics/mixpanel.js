/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import mixpanel from 'mixpanel-browser';

export default class Mixpanel {

  constructor() {
    this.enabled = false;
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new Mixpanel();
    }

    return this.instance;
  }

  track(name, props) {
    if (this.enabled) {
      mixpanel.track(`desktopModeler:${name}`, props);
    }
  }

  enable(token, id, stage) {
    mixpanel.init(token, {
      debug: true,
    });

    mixpanel.identify(id);

    mixpanel.register({
      stage
    });

    this.verifyOptIn();

    this.enabled = true;
  }

  disable() {
    if (this.enabled) {
      mixpanel.opt_out_tracking();
    }

    this.enabled = false;
  }

  verifyOptIn() {
    if (!mixpanel.has_opted_in_tracking()) {
      mixpanel.opt_in_tracking();
    }
  }
}