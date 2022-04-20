/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import React, { PureComponent } from 'react';

import {
  omit
} from 'min-dash';

import pDefer from 'p-defer';

import classNames from 'classnames';

import { Fill } from '../../../app/slot-fill';

import DeployIcon from 'icons/Deploy.svg';

import {
  generateId
} from '../../../util';

import { AUTH_TYPES } from './../shared/ZeebeAuthTypes';

import { CAMUNDA_CLOUD } from '../shared/ZeebeTargetTypes';

import DeploymentPluginOverlay from './DeploymentPluginOverlay';

import DeploymentPluginValidator from './DeploymentPluginValidator';

import { ENGINES } from '../../../util/Engines';

import css from './DeploymentPlugin.less';

const DEPLOYMENT_CONFIG_KEY = 'zeebe-deployment-tool';

const ZEEBE_ENDPOINTS_CONFIG_KEY = 'zeebeEndpoints';

const GRPC_ERROR_CODES = {
  0: 'OK',
  1: 'CANCELLED',
  2: 'UNKNOWN',
  3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED',
  9: 'FAILED_PRECONDITION',
  10: 'ABORTED',
  11: 'OUT_OF_RANGE',
  12: 'UNIMPLEMENTED',
  13: 'INTERNAL',
  14: 'UNAVAILABLE',
  15: 'DATA_LOSS',
  16: 'UNAUTHENTICATED'
};

export default class DeploymentPlugin extends PureComponent {

  constructor(props) {
    super(props);

    this.state = {
      activeTab: null,
      overlayState: null
    };
    this.validator = new DeploymentPluginValidator(props._getGlobal('zeebeAPI'));
    this.connectionChecker = this.validator.createConnectionChecker();
    this._anchorRef = React.createRef();
  }

  componentDidMount() {
    this.props.subscribe('app.activeTabChanged', ({ activeTab }) => {
      this.setState({
        activeTab,
        overlayState: null
      });
    });

    this.props.subscribeToMessaging('deploymentPlugin', this.onMessageReceived);
  }

  componentWillUnmount() {
    this.props.unsubscribeFromMessaging('deploymentPlugin');
  }

  async deploy(options = {}) {
    const {
      activeTab: tab
    } = this.state;

    /**
     * Notify interested parties via optional callback.
     *
     * @param {object} result
     * @param {object|null} result.deploymentResult - null for cancellation
     * @param {object} [result.endpoint]
     */


    // (1) get deploy config
    const deployConfig = await this.getDeployConfig(tab, options);

    if (!deployConfig) {
      return;
    }

    // (3) deploy
    await this.deployWithConfig(options, deployConfig);
  }

  notifyResult(result, options) {
    const { done } = options;

    return done && done(result);
  }


  async getDeployConfig(tab, options) {

    // (1) save tab
    const savedTab = await this.saveTab(tab);

    // cancel action if save was cancelled
    if (!savedTab) {
      this.notifyResult(null, options);
      return;
    }

    // (2) retrieve saved config
    let config = await this.getSavedConfig(tab);

    const endpoint = await this.getDefaultEndpoint(tab);

    config = {
      ...config,
      endpoint
    };

    // (2.1) open overlay if config is incomplete
    const canDeploy = await this.canDeployWithConfig(config, options);

    if (!canDeploy) {
      config = await this.getConfigFromUser({}, savedTab, options);

      // user canceled
      if (!config) {
        this.notifyResult(null, options);
        return;
      }
    } else {

      // no more input needed for start instance
      if (options.isStart) {
        options.onClose();
      }
    }

    if (options.notifyResult) {
      this.notifyResult({ config, savedTab }, options);
    }

    config = await this.saveConfig(savedTab, config);

    return { savedTab, config };
  }

  async deployWithConfig(options, deployConfig) {
    const { savedTab, config } = deployConfig;

    const deploymentResult = await this.deployTab(savedTab, config);

    // (4) include version deployed to as contextual information
    options.gatewayVersion = await this.getGatewayVersion(config);

    // (5) notify interested parties
    this.notifyResult({
      deploymentResult,
      endpoint: config.endpoint
    }, options);

    const { response, success } = deploymentResult;

    // (6) Handle success or error
    if (!success) {
      this.onDeploymentError(response, deployConfig, options);
    } else {
      this.onDeploymentSuccess(response, deployConfig, options);
    }
  }

  deployTab(tab, config) {
    const { file: { path } } = tab;
    const {
      deployment: { name },
      endpoint
    } = config;

    const zeebeAPI = this.props._getGlobal('zeebeAPI');

    return zeebeAPI.deploy({
      filePath: path,
      name,
      endpoint,
      diagramType: tab.type === 'cloud-dmn' ? 'dmn' : 'bpmn'
    });
  }

  async getGatewayVersion(config) {
    const {
      endpoint
    } = config;

    const zeebeAPI = this.props._getGlobal('zeebeAPI');

    const getGatewayVersionResult = await zeebeAPI.getGatewayVersion(endpoint);

    const { gatewayVersion } = getGatewayVersionResult.response;

    return gatewayVersion;
  }

  saveTab(tab) {
    return this.props.triggerAction('save', { tab });
  }

  async canDeployWithConfig(config, options) {

    const {
      isStart
    } = options;

    if (!isStart) {
      return false;
    }

    // return early for missing essential parts
    if (!config.deployment || !config.endpoint) {
      return false;
    }

    const validationResult = this.validator.validateConfig(config);
    const isConfigValid = Object.keys(validationResult).length === 0;

    if (!isConfigValid) {
      return false;
    }

    const { connectionResult } = await this.connectionChecker.check(config.endpoint);

    return connectionResult && connectionResult.success;
  }

  async getConfigFromUser(savedConfig, tab, options = {}) {

    const p = pDefer();

    const onClose = (config, userAction) => {

      if (options.onClose) {
        options.onClose();
      }

      this.closeOverlay();

      if (userAction === 'cancel') {
        this.saveConfig(tab, config);
        return p.resolve(null);
      }

      return p.resolve(config);
    };

    const defaultConfiguration = await this.getDefaultConfig(savedConfig, tab);

    const overlayState = {
      config: defaultConfiguration,
      isStart: !!options.isStart,
      onClose,
      anchorRef: options.anchorRef || this._anchorRef
    };

    // open overlay
    this.setState({
      overlayState
    });

    return p.promise;
  }

  onMessageReceived = async (msg, body) => {

    if (msg === 'deployWithConfig') {
      const { deploymentConfig } = body;
      this.deployWithConfig(body, deploymentConfig);
    }

    if (msg === 'getDeployConfig') {
      this.getDeployConfig(this.state.activeTab, body);
    }

    if (msg === 'cancel') {
      const { overlayState } = this.state;

      if (overlayState) {
        this.state.overlayState.onClose(null);
      }
    }
  }

  async saveConfig(tab, config) {
    const {
      endpoint,
      deployment
    } = config;

    const endpointToSave = endpoint.rememberCredentials ? endpoint : withoutCredentials(endpoint);

    await this.saveEndpoint(endpointToSave);

    const tabConfiguration = {
      deployment,
      endpointId: endpointToSave.id
    };

    await this.setTabConfiguration(tab, tabConfiguration);

    return config;
  }

  async getSavedConfig(tab) {

    const tabConfig = await this.getTabConfiguration(tab);

    if (!tabConfig) {
      return {};
    }

    const {
      deployment
    } = tabConfig;

    return {
      deployment,
    };
  }

  async getDefaultEndpoint(tab) {
    let endpoint = {
      id: generateId(),
      targetType: CAMUNDA_CLOUD,
      authType: AUTH_TYPES.NONE,
      contactPoint: '',
      oauthURL: '',
      audience: '',
      clientId: '',
      clientSecret: '',
      camundaCloudClientId: '',
      camundaCloudClientSecret: '',
      camundaCloudClusterUrl: '',
      rememberCredentials: false
    };

    const previousEndpoints = await this.getEndpoints();
    if (previousEndpoints.length) {
      endpoint = previousEndpoints[0];
    }

    // #2375 => if we only have a clusterId, transform it to clusterURL for backwards-compatability
    if (!endpoint.camundaCloudClusterUrl && endpoint.camundaCloudClusterId) {
      endpoint.camundaCloudClusterUrl = createCamundaCloudClusterUrl(endpoint.camundaCloudClusterId);
    }

    return endpoint;
  }

  async getDefaultConfig(savedConfig, tab) {
    const deployment = {
      name: withoutExtension(tab.name)
    };

    const endpoint = await this.getDefaultEndpoint(tab);

    return {
      deployment: {
        ...deployment,
        ...savedConfig.deployment
      },
      endpoint
    };
  }

  async saveEndpoint(endpoint) {
    const existingEndpoints = await this.getEndpoints();

    const updatedEndpoints = addOrUpdateById(existingEndpoints, endpoint);

    await this.setEndpoints(updatedEndpoints);

    return endpoint;
  }

  getEndpoints() {
    return this.props.config.get(ZEEBE_ENDPOINTS_CONFIG_KEY, []);
  }

  setEndpoints(endpoints) {
    return this.props.config.set(ZEEBE_ENDPOINTS_CONFIG_KEY, endpoints);
  }

  getTabConfiguration(tab) {
    return this.props.config.getForFile(tab.file, DEPLOYMENT_CONFIG_KEY);
  }

  setTabConfiguration(tab, configuration) {
    return this.props.config.setForFile(tab.file, DEPLOYMENT_CONFIG_KEY, configuration);
  }

  onDeploymentSuccess(response, configuration, options = {}) {
    const { config, savedTab } = configuration;

    const {
      displayNotification,
      triggerAction
    } = this.props;

    const {
      endpoint
    } = config;

    const {
      isStart
    } = options;

    const {
      gatewayVersion
    } = options;

    const content = endpoint.targetType === CAMUNDA_CLOUD ?
      <CloudLink endpoint={ endpoint } response={ response } />
      : null;

    if (!options.skipNotificationOnSuccess) {
      displayNotification({
        type: 'success',
        title: this._getSuccessNotification(savedTab),
        content: content,
        duration: 8000
      });
    }

    // notify interested parties
    triggerAction('emit-event', {
      type: 'deployment.done',
      payload: {
        deployment: response,
        context: isStart ? 'startInstanceTool' : 'deploymentTool',
        targetType: endpoint && endpoint.targetType,
        deployedTo: {
          executionPlatformVersion: gatewayVersion,
          executionPlatform: ENGINES.CLOUD
        }
      }
    });
  }

  _getSuccessNotification(tab) {
    return `${tab.type === 'cloud-dmn' ? 'Decision' : 'Process'} definition deployed`;
  }

  onDeploymentError(response, configuration, options = {}) {
    const { config } = configuration;

    const {
      log,
      displayNotification,
      triggerAction
    } = this.props;

    const {
      endpoint
    } = config;

    const {
      isStart
    } = options;

    const {
      gatewayVersion
    } = options;

    // If we retrieved the gatewayVersion, include it in event
    const deployedTo = (gatewayVersion &&
      { executionPlatformVersion: gatewayVersion, executionPlatform: ENGINES.CLOUD }) || undefined;

    const logMessage = {
      category: 'deploy-error',
      message: response.details || response.message,
      silent: true
    };

    log(logMessage);

    const content = <button
      onClick={ () => triggerAction('open-log') }>
      See the log for further details.
    </button>;

    displayNotification({
      type: 'error',
      title: 'Deployment failed',
      content,
      duration: 4000
    });

    // notify interested parties
    triggerAction('emit-event', {
      type: 'deployment.error',
      payload: {
        error: {
          ...response,
          code: getGRPCErrorCode(response)
        },
        context: isStart ? 'startInstanceTool' : 'deploymentTool',
        ...(deployedTo && { deployedTo: deployedTo }),
        targetType: endpoint && endpoint.targetType
      }
    });
  }

  closeOverlay() {
    this.setState({ overlayState: null });
  }

  onIconClicked = () => {
    const {
      overlayState
    } = this.state;

    if (overlayState && !overlayState.isStart) {
      this.closeOverlay();

      this.props.triggerAction('emit-event', {
        type: 'deployment.closed',
        payload: {
          context: 'deploymentTool',
        }
      });
    }

    else {
      this.props.triggerAction('emit-event', {
        type: 'deployment.opened',
        payload: {
          context: 'deploymentTool',
        }
      });

      this.deploy();
    }
  }

  isButtonActive = () => {
    const {
      overlayState
    } = this.state;

    return overlayState ? !overlayState.isStart : null;
  }

  render() {
    const {
      overlayState,
      activeTab
    } = this.state;

    return <React.Fragment>
      { isZeebeTab(activeTab) &&
        <Fill slot="status-bar__file" group="8_deploy" priority={ 1 }>
          <button
            onClick={ this.onIconClicked }
            title="Deploy current diagram"
            className={ classNames('btn', css.DeploymentPlugin, { 'btn--active': this.isButtonActive() }) }
            ref={ this._anchorRef }
          >
            <DeployIcon className="icon" />
          </button>
        </Fill>
      }
      { overlayState &&
        <DeploymentPluginOverlay
          onClose={ overlayState.onClose }
          validator={ this.validator }
          onDeploy={ overlayState.onClose }
          isStart={ overlayState.isStart }
          config={ overlayState.config }
          anchor={ overlayState.anchorRef.current }
        />
      }
    </React.Fragment>;
  }
}


function CloudLink(props) {
  const {
    endpoint,
    response
  } = props;

  const {
    camundaCloudClusterUrl,
    camundaCloudClusterRegion
  } = endpoint;

  const processId = getProcessId(response);

  if (!processId) {
    return null;
  }

  const query = `?process=${processId}&version=all&active=true&incidents=true`;
  const cluster = camundaCloudClusterUrl.substring(0, camundaCloudClusterUrl.indexOf('.'));
  const cloudUrl = `https://${camundaCloudClusterRegion}.operate.camunda.io/${cluster}/instances/${query}`;

  return (
    <div className={ css.CloudLink }>
      <div>
        Process Definition ID:
        <code>{processId}</code>
      </div>
      <a href={ cloudUrl }>
        Open in Camunda Operate
      </a>
    </div>
  );
}

// helpers //////////

function withoutExtension(name) {
  return name.replace(/\.[^.]+$/, '');
}

function addOrUpdateById(collection, element) {

  const index = collection.findIndex(el => el.id === element.id);

  if (index !== -1) {
    return [
      ...collection.slice(0, index),
      element,
      ...collection.slice(index + 1)
    ];
  }

  return [
    ...collection,
    element
  ];
}


function withoutCredentials(endpointConfiguration) {
  return omit(endpointConfiguration, [
    'clientId',
    'clientSecret',
    'camundaCloudClientId',
    'camundaCloudClientSecret'
  ]);
}

function isZeebeTab(tab) {
  return tab && [ 'cloud-bpmn', 'cloud-dmn' ].includes(tab.type);
}

function getGRPCErrorCode(error) {
  const {
    code
  } = error;

  return code ? GRPC_ERROR_CODES[code] : 'UNKNOWN';
}

function createCamundaCloudClusterUrl(camundaCloudClusterId) {
  return camundaCloudClusterId + '.bru-2.zeebe.camunda.io:443';
}

function getProcessId(response) {
  return response.workflows && response.workflows[0] && response.workflows[0].bpmnProcessId || null;
}
