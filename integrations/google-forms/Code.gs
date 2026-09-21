var PESANPRO_HANDLER = 'pesanProOnFormSubmit';

function pesanProConfig() {
  var properties = PropertiesService.getScriptProperties();
  var baseUrl = String(properties.getProperty('PESANPRO_BASE_URL') || '').replace(/\/$/, '');
  var token = String(properties.getProperty('PESANPRO_TOKEN') || '');
  var recipientField = String(properties.getProperty('PESANPRO_RECIPIENT_FIELD') || '');
  var staticRecipient = String(properties.getProperty('PESANPRO_STATIC_RECIPIENT') || '');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('PESANPRO_BASE_URL must use HTTPS.');
  if (!/^ppint_[A-Za-z0-9_-]{40,100}$/.test(token)) throw new Error('PESANPRO_TOKEN is missing or invalid.');
  if (!recipientField && !staticRecipient) throw new Error('Set PESANPRO_RECIPIENT_FIELD or PESANPRO_STATIC_RECIPIENT.');
  return { baseUrl: baseUrl, token: token, recipientField: recipientField, staticRecipient: staticRecipient };
}

function pesanProInstallTrigger() {
  pesanProConfig();
  var form = FormApp.getActiveForm();
  if (!form) throw new Error('Open this script from the target Google Form.');
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === PESANPRO_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(PESANPRO_HANDLER).forForm(form).onFormSubmit().create();
  return 'PesanPro trigger installed for form ' + form.getId();
}

function pesanProOnFormSubmit(event) {
  if (!event || !event.response || !event.source) throw new Error('This function must run from a Google Forms submit trigger.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another PesanPro form delivery is active.');
  try {
    var config = pesanProConfig();
    var payload = pesanProBuildPayload(event, config);
    var idempotencyKey = pesanProStableKey(event.source.getId() + ':' + payload.responseId);
    pesanProPost(config, payload, idempotencyKey);
  } finally {
    lock.releaseLock();
  }
}

function pesanProBuildPayload(event, config) {
  var fields = {};
  event.response.getItemResponses().forEach(function(itemResponse) {
    var title = String(itemResponse.getItem().getTitle() || '').trim();
    if (!title) return;
    var response = itemResponse.getResponse();
    fields[title] = Array.isArray(response) ? response.map(String) : String(response == null ? '' : response);
  });
  var timestamp = event.response.getTimestamp();
  var responseId = event.response.getId();
  if (!responseId) responseId = pesanProStableKey(event.source.getId() + ':' + timestamp.toISOString() + ':' + JSON.stringify(fields));
  var recipient = config.staticRecipient || fields[config.recipientField] || '';
  if (Array.isArray(recipient)) recipient = recipient[0] || '';
  var email = event.response.getRespondentEmail ? event.response.getRespondentEmail() : null;
  return {
    responseId: String(responseId),
    formId: String(event.source.getId()),
    formTitle: String(event.source.getTitle() || ''),
    submittedAt: timestamp.toISOString(),
    respondentEmail: email ? String(email) : undefined,
    recipient: String(recipient),
    fields: fields
  };
}

function pesanProStableKey(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return 'gf-' + bytes.map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function pesanProPost(config, payload, idempotencyKey) {
  var url = config.baseUrl + '/api/v1/integrations/google-forms';
  var lastCode = 0;
  for (var attempt = 0; attempt < 3; attempt += 1) {
    try {
      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json; charset=utf-8',
        headers: { 'X-Integration-Token': config.token, 'Idempotency-Key': idempotencyKey },
        payload: JSON.stringify(payload),
        followRedirects: false,
        validateHttpsCertificates: true,
        muteHttpExceptions: true,
        timeoutSeconds: 15
      });
      lastCode = response.getResponseCode();
      if (lastCode >= 200 && lastCode < 300) return;
      if ([408, 425, 429].indexOf(lastCode) === -1 && lastCode < 500) throw new Error('PesanPro rejected the submission with HTTP ' + lastCode + '.');
    } catch (error) {
      if (attempt === 2 || /^PesanPro rejected/.test(error.message)) throw error;
    }
    Utilities.sleep(500 * Math.pow(2, attempt));
  }
  throw new Error('PesanPro is temporarily unavailable (last HTTP ' + lastCode + ').');
}

function pesanProCheckConfiguration() {
  var config = pesanProConfig();
  return { endpoint: config.baseUrl, tokenConfigured: true, recipientMode: config.staticRecipient ? 'static' : 'field' };
}
