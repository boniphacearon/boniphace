export const Voice = {
  recognition: null,
  synth: window.speechSynthesis,
  init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn('Speech recognition not supported');
      return;
    }
    this.recognition = new SR();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';
  },
  start() {
    if (!this.recognition) { 
      alert('Voice input not supported in this browser'); 
      return; 
    }
    const btn = document.getElementById('voice-btn');
    if (btn) {
      btn.style.background = 'var(--accent)';
      btn.style.color = '#0a0a0a';
    }
    this.recognition.lang = window.BP?.settings?.language === 'sw' ? 'sw-KE' : 'en-US';
    this.recognition.start();
    this.recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      const input = document.getElementById('message-input');
      if (input) {
        input.value += (input.value ? ' ' : '') + text;
      }
      if (btn) {
        btn.style.background = '';
        btn.style.color = '';
      }
    };
    this.recognition.onerror = () => {
      if (btn) {
        btn.style.background = '';
        btn.style.color = '';
      }
    };
    this.recognition.onend = () => {
      if (btn) {
        btn.style.background = '';
        btn.style.color = '';
      }
    };
  },
  speak(text) {
    if (!this.synth || !window.BP?.settings?.tts_enabled) return;
    const clean = text.replace(/```[\s\S]*?```/g, '').replace(/[#*_`]/g, '').slice(0, 1000);
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = window.BP?.settings?.language === 'sw' ? 'sw-KE' : 'en-US';
    this.synth.speak(u);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const voiceBtn = document.getElementById('voice-btn');
  if (voiceBtn) {
    voiceBtn.addEventListener('click', () => Voice.start());
  }
  Voice.init();
});
