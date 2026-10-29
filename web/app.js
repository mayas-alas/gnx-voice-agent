const $ = id => document.getElementById(id);
let session = crypto.randomUUID();
let pending = false;
let recognition;
let listening = false;
const audioUrls = new Set();
const status = text => { $('status').textContent = text; };
function message(role, text) {
  $('empty')?.remove();
  const block = document.createElement('article');
  block.className = `message ${role === 'GNX' ? 'answer' : ''}`;
  const title = document.createElement('strong');
  title.textContent = role;
  const content = document.createElement('p');
  content.textContent = text;
  block.append(title, content);
  $('conversation').append(block);
  return block;
}
function headers() {
  const token = $('token').value.trim();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
async function loadCapabilities() {
  try {
    const response = await fetch('/v1/capabilities', { headers: headers() });
    if (!response.ok) { status(response.status === 401 ? 'Enter the application token in Connection settings.' : 'Cannot read server capabilities.'); return; }
    const data = await response.json();
    $('speak').disabled = !data.speech;
    if (!data.speech) $('speak').checked = false;
    status(data.speech ? 'Ready. Voice output is configured.' : 'Ready for text. Voice output is not configured.');
  } catch { status('Server unavailable.'); }
}
$('token').addEventListener('change', loadCapabilities);
$('composer').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('text').value.trim();
  if (!text || pending) return;
  pending = true;
  recognition?.abort();
  $('send').disabled = $('reset').disabled = $('mic').disabled = true;
  status('Composing your answer…');
  message('You', text);
  try {
    const response = await fetch('/v1/turns', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ session_id: session, turn_id: crypto.randomUUID(), text,
        locale: $('locale').value, speak: $('speak').checked })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.code || `HTTP ${response.status}`);
    const block = message('GNX', data.text);
    if (data.speech.status === 'ready') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      if (data.speech.audio_base64) {
        const bytes = Uint8Array.from(atob(data.speech.audio_base64), char => char.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: data.speech.mime_type }));
        audioUrls.add(url);
        audio.src = url;
      } else {
        audio.src = data.speech.url;
      }
      audio.addEventListener('error', () => status('Text is ready; audio is unavailable or expired.'));
      block.append(audio);
      status('Answer ready. Press play to listen.');
    } else {
      status(['failed', 'unavailable'].includes(data.speech.status)
        ? 'Answer ready. Speech is unavailable; your text is preserved.' : 'Answer ready.');
    }
    if ($('text').value.trim() === text) $('text').value = '';
  } catch (error) {
    status(`Could not finish: ${error.message}. Your draft is preserved. No automatic retry was made.`);
  } finally {
    pending = false;
    $('send').disabled = $('reset').disabled = false;
    $('mic').disabled = !recognition;
    $('text').focus();
  }
});
$('reset').addEventListener('click', () => {
  recognition?.abort();
  document.querySelectorAll('audio').forEach(audio => audio.pause());
  audioUrls.forEach(url => URL.revokeObjectURL(url));
  audioUrls.clear();
  session = crypto.randomUUID();
  $('conversation').replaceChildren();
  status('New correlation session. This does not delete upstream provider data.');
});
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.interimResults = false;
  recognition.onresult = event => {
    $('text').value = `${$('text').value} ${event.results[0][0].transcript}`.trim().slice(0, 8000);
    status('Transcript ready. Review it before sending.');
  };
  recognition.onerror = event => status(`Microphone: ${event.error}. You can still type.`);
  recognition.onend = () => { listening = false; $('mic').textContent = 'Use microphone'; };
  $('mic').addEventListener('click', () => {
    if (listening) { recognition.stop(); return; }
    recognition.lang = $('locale').value;
    try {
      recognition.start(); listening = true; $('mic').textContent = 'Stop listening';
      status('Listening through your browser…');
    } catch { status('Microphone unavailable. You can still type.'); }
  });
} else {
  $('mic').disabled = true;
  $('mic').textContent = 'Speech input unsupported';
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
loadCapabilities();
