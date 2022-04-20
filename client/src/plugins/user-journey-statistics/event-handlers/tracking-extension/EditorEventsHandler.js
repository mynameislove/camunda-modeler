/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import Mixpanel from '../../Mixpanel';

export default function EditorEventsHandler(eventBus) {

  const mixpanel = Mixpanel.getInstance();

  eventBus.on('shape.added', function() {
    mixpanel.track('element:added');
  });

  eventBus.on('shape.removed', function() {
    mixpanel.track('element:removed');
  });

  eventBus.on('shape.changed', function() {
    mixpanel.track('element:changed');
  });

}

EditorEventsHandler.$inject = [ 'eventBus' ];

