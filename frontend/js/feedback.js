import { API_BASE } from 'app/config';
import { $, QA, esc } from 'app/ui';
import { fetchJSON } from 'app/api';

export const SUS_QUESTIONS = [
  '我愿意经常使用这个系统。',
  '我觉得这个系统过于复杂。',
  '我觉得这个系统容易使用。',
  '我需要技术人员帮助才能使用这个系统。',
  '我觉得系统中的各项功能整合得很好。',
  '我觉得这个系统存在太多不一致之处。',
  '我认为大多数人能够很快学会使用这个系统。',
  '我觉得这个系统使用起来很繁琐。',
  '我对使用这个系统很有信心。',
  '我需要学习很多东西才能开始使用这个系统。'
];

export function initFeedback() {
  const answers = $('sus-questions');
  answers.innerHTML = SUS_QUESTIONS.map((question, i) => `<label class="sus-question" for="sus-${i}">
    <span>${i + 1}. ${esc(question)}</span><select id="sus-${i}" name="sus-${i}">
    <option value="">请选择</option>${['非常不同意', '不同意', '中立', '同意', '非常同意'].map((label, index) => `<option value="${index + 1}">${index + 1} · ${label}</option>`).join('')}</select></label>`).join('');
  for (const kind of ['feedback', 'privacy']) {
    const dialog = $(`${kind}-dialog`);
    let opener = null;
    QA(`[data-open="${kind}"]`).forEach(button => button.addEventListener('click', () => {
      opener = button;
      dialog.classList.remove('hidden');
      dialog.showModal();
      $(`${kind}-close`).focus();
    }));
    $(`${kind}-close`).addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.classList.add('hidden'); opener?.focus(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  }

  $('feedback-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $('feedback-status');
    const selected = QA('select', answers).map(select => select.value);
    const hasSus = selected.some(Boolean);
    if (hasSus && selected.some(value => !value)) {
      message.textContent = 'SUS 量表须完整回答10题，或全部留空仅提交意见。';
      $('sus-details').open = true;
      QA('select', answers).find(select => !select.value).focus();
      return;
    }
    const submit = $('feedback-submit');
    submit.disabled = true;
    message.textContent = '正在提交…';
    try {
      const data = new FormData(form);
      const response = await fetchJSON(`${API_BASE}/api/feedback`, 8000, { method: 'POST', body: JSON.stringify({
        rating: Number(data.get('rating')), comment: data.get('comment'), scenario: data.get('scenario'),
        adviceAccuracy: data.get('adviceAccuracy') ? Number(data.get('adviceAccuracy')) : null,
        sus: hasSus ? selected.map(Number) : null
      }) });
      if (!response?.ok) { message.textContent = response?.error || '提交失败，请稍后重试。'; return; }
      form.reset();
      $('sus-details').open = false;
      message.textContent = '感谢反馈，已提交成功。';
    } finally { submit.disabled = false; }
  });
}
