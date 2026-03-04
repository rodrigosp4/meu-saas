export const stripHtml = (html) => {
  if (!html) return '';
  try {
    let text = html.replace(/\r/g, '');
    text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<hr\s*\/?>/gi, '\n');
    text = text.replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|table)>/gi, '\n\n');
    text = text.replace(/<\/(li|tr)>/gi, '\n');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    
    const tmp = document.createElement("DIV");
    tmp.innerHTML = text;
    text = tmp.textContent || tmp.innerText || "";
    
    text = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
    text = text.replace(/\u00A0/g, ' ').replace(/\t/g, ' ');
    text = text.replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/•/g, '-').replace(/…/g, '...');
    
    let lines = text.split('\n');
    lines = lines.map(line => line.trim().replace(/ +/g, ' '));
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch (e) {
    return html;
  }
};