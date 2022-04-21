/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import debug from 'debug';

import eventHandlers from './event-handlers';

import React, {
  Fragment,
  PureComponent
} from 'react';

import { Fill } from '../../app/slot-fill';

import Flags, { MIXPANEL_TOKEN, DISABLE_REMOTE_INTERACTION } from '../../util/Flags';

import Mixpanel from './Mixpanel';

import classNames from 'classnames';

import css from './UserJourneyStatistics.less';

import { UserFeedbackOverlay } from './UserFeedbackOverlay';

const log = debug('UsageStatistics');

const PRIVACY_PREFERENCES_CONFIG_KEY = 'editor.privacyPreferences';
const USAGE_STATISTICS_CONFIG_KEY = 'ENABLE_USAGE_STATISTICS';
const EDITOR_ID_CONFIG_KEY = 'editor.id';

// ET endpoint is set to our CI provider as an env variable, passed to client via WebPack DefinePlugin
const DEFINED_MIXPANEL_TOKEN = null;

// In order to plug a new event handler:
//
// 1) Create a new event handler class under event-handlers
// 2) This class should extend BaseEventHandler
// 3) This class should use 'sendToET(data={})' super method to send a payload to ET
// 4) This class should be exported via index.js in order to be recognize by UsageStatistics plugin.
//
// See the example implementations: PingEventHandler, DiagramOpenEventHandler.

export default class UserJourneyStatistics extends PureComponent {

  constructor(props) {
    super(props);

    // ET_ENDPOINT flag is useful for development.
    this.MIXPANEL_TOKEN = Flags.get(MIXPANEL_TOKEN) || DEFINED_MIXPANEL_TOKEN;
    this.stage = 'int';

    this._isEnabled = false;

    this._eventHandlers = [];

    this._buttonRef = React.createRef(null);

    this.mixpanel = Mixpanel.getInstance();

    this.state = {
      open: false
    };

    eventHandlers.forEach((eventHandlerConstructor) => {
      this._eventHandlers.push(new eventHandlerConstructor({
        ...this.props }));
    });

  }

   isEnabled = () => {
     return this._isEnabled;
   }

   enable = () => {
     log('Enabling');

     this.mixpanel.enable(this.MIXPANEL_TOKEN, this._editorID, this.stage);
     this._isEnabled = true;
   }

   disable = () => {
     log('Disabling.');

     this.mixpanel.disable();
     this._isEnabled = false;
   }

   async setEditorId() {
     this._editorID = await this.props.config.get(EDITOR_ID_CONFIG_KEY);

     if (!this._editorID) {
       throw new Error('missing editor id');
     }
   }

   async componentDidMount() {

     // make sure we also set the editor although the plugin is not enabled
     await this.setEditorId();

     if (!this.MIXPANEL_TOKEN) {
       return log('Not enabled: Mixpanel project token not configured.');
     }

     if (Flags.get(DISABLE_REMOTE_INTERACTION)) {
       return log('Not enabled: Remote interaction disabled.');
     }

     // If remote interaction is not disabled via flags:
     // -> The user may turn on / off usage statistics on the run
     // -> The user may never actually restart the modeler.
     this.props.subscribe('privacy-preferences.changed', this.handlePrivacyPreferencesChanged);

     const isUsageStatisticsEnabled = await this.isUsageStatisticsEnabled();

     if (!isUsageStatisticsEnabled) {
       return log('Not enabled: Usage statistics are turned off via Privacy Preferences.');
     }

     this.enable();
   }

   async isUsageStatisticsEnabled() {
     const { config } = this.props;

     const privacyPreferences = await config.get(PRIVACY_PREFERENCES_CONFIG_KEY);

     return !!(privacyPreferences && privacyPreferences[USAGE_STATISTICS_CONFIG_KEY]);
   }

   handlePrivacyPreferencesChanged = async () => {
     const isUsageStatisticsEnabled = await this.isUsageStatisticsEnabled();

     if (isUsageStatisticsEnabled) {
       return this.enable();
     }

     return this.disable();
   }

   toggle = () => {
     this.setState(state => ({ ...state, open: !state.open }));
   }

   render() {

     const {
       _buttonRef: buttonRef
     } = this;

     const {
       open
     } = this.state;

     console.log(buttonRef);

     return (
       <Fragment>
         <Fill slot="status-bar__app" group="test">
           <button
             className={ classNames('btn', { 'btn--active': open }, css.UserJourneyStatistics) }
             title="Provide Feedback"
             onClick={ this.toggle }
             ref={ buttonRef }
           >
             test
           </button>
         </Fill>
         {
           open && <UserFeedbackOverlay
             anchor={ buttonRef.current }
             onClose={ () => this.setState({ open: false }) }

           />
         }
       </Fragment>
     );
   }
}