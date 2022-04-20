/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import Mixpanel from '../Mixpanel';

const types = {
  BPMN: 'bpmn',
  DMN: 'dmn',
  CMMN: 'cmmn',
  FORM: 'form'
};

const mixpanel = Mixpanel.getInstance();

export default class ModelerEventsHandler {
  constructor(props) {

    const {
      subscribe
    } = props;

    // open diagram
    subscribe('bpmn.modeler.created', () => {
      this.trackDiagramOpened(types.BPMN);
    });

    subscribe('dmn.modeler.created', () => {
      this.trackDiagramOpened(types.DMN);
    });

    subscribe('form.modeler.created', () => {
      this.trackDiagramOpened(types.FORM);
    });

    subscribe('tab.closed', () => {
      mixpanel.track('diagram:closed');
    });

    // deploy
    subscribe('deployment.opened', ({ context }) => {
      this.trackDeploymentOverlay(types.BPMN, 'opened', context);
    });

    subscribe('deployment.closed', ({ context }) => {
      this.trackDeploymentOverlay(types.BPMN, 'closed', context);
    });

    subscribe('deployment.done', ({ context }) => {
      this.trackDeploymentAction(types.BPMN, true, context);
    });

    subscribe('deployment.error', ({ context }) => {
      this.trackDeploymentAction(types.BPMN, false, context);
    });

  }

  trackDiagramOpened = (diagramType) => {
    mixpanel.track('diagram:opened', {
      diagramType
    });
  }

  trackDeploymentAction = (diagramType, success, context) => {

    const baseEvent = context === 'deploymentTool' ? 'deploy' : 'startInstance';
    const outcome = success ? 'success' : 'error';

    const eventName = baseEvent + ':' + outcome;

    mixpanel.track(eventName, {
      diagramType
    });
  }

  trackDeploymentOverlay = (diagramType, action, context) => {
    const baseEvent = context === 'deploymentTool' ? 'deploy' : 'startInstance';
    const eventName = `${baseEvent}:${action}`;

    mixpanel.track(eventName, {
      diagramType
    });
  }

}