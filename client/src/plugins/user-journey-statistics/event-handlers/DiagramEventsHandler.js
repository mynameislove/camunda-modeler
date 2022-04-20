/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import TrackingExtension from './tracking-extension';
import { PureComponent } from 'react';


export default class DiagramEventsHandler extends PureComponent {
  constructor(props) {

    super(props);
    const {
      subscribe,
      track
    } = props;

    this.track = track;

    subscribe('bpmn.modeler.configure', (event) => {

      const {
        middlewares
      } = event;


      middlewares.push(addModule(TrackingExtension));
    });

    subscribe('dmn.modeler.configure', (event) => {

      const {
        middlewares
      } = event;

      middlewares.push(addDmnModule(TrackingExtension));
    });
  }

}

function addModule(extensionModule) {

  return (config) => {

    const additionalModules = config.additionalModules || [];

    return {
      ...config,
      additionalModules: [
        ...additionalModules,
        extensionModule
      ]
    };
  };
}

function addDmnModule(extensionModule) {
  return config => {
    const newConfig = { ...config
    };

    for (const viewer of [ 'drd', 'decisionTable', 'literalExpression' ]) {
      newConfig[viewer] = newConfig[viewer] || {};
      const additionalModules = newConfig[viewer] && newConfig[viewer].additionalModules || [];
      newConfig[viewer].additionalModules = [ ...additionalModules, extensionModule ];
    }

    return newConfig;
  };
}