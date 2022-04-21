/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import React from 'react';

import { Overlay, Section, Radio } from '../../shared/ui';

import {
  Field,
  Form,
  Formik
} from 'formik';

import css from './UserJourneyStatistics.less';

import {
  TextInput
} from '../../shared/ui/form';

import Mixpanel from './Mixpanel';

const mixpanel = Mixpanel.getInstance();

const OFFSET = { right: 0 };

export function UserFeedbackOverlay(props) {

  const submitForm = (data) => {
    props.onClose();
    mixpanel.track('feedback', data);
  };

  return (
    <Overlay
      anchor={ props.anchor }
      onClose={ props.onClose }
      offset={ OFFSET }
      className={ css.UserJourneyStatistics }
    >
      <Section>
        <Section.Header>
          Share your feedback
        </Section.Header>
        <Section.Body>
          <Formik
            initialValues={ { experience: 'positive' } }
            onSubmit={ submitForm }
          >
            <Form>
              <Field
                name="experience"
                component={ Radio }
                label={ 'How was your experience?' }
                className="target_radio"
                values={
                  [
                    { value: 'positive', label: ':)' },
                    { value: 'negative', label: ':(' }
                  ]
                }
              />
              <Field
                name="feedback"
                component={ TextInput }
                multiline={ true }
                label="Tell us why"
              />

              <Section.Actions>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Send
                </button>
              </Section.Actions>
            </Form>
          </Formik>
        </Section.Body>
      </Section>
    </Overlay>
  );
}
