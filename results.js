'use strict';

// pdf-lib is bundled locally so reports also work without internet access.
window.DailyResults = (() => {
  const clean = value => String(value ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

  function snapshot(state, now = new Date()) {
    const areas = new Map(state.areas.map(area => [area.id, area]));
    const members = state.employees.map(employee => {
      const ids = [...new Set(state.assignments[employee.id] || [])];
      const activities = ids.filter(id => areas.has(id)).map(id => ({
        area: clean(areas.get(id).name),
        tasks: [...new Set(employee.tasksByArea?.[id] || (ids.length === 1 ? employee.taskNumbers || [] : []))].map(clean),
      }));
      return {
        name: clean(employee.name),
        department: clean(employee.role || employee.department),
        color: /^#[0-9a-f]{6}$/i.test(employee.color) ? employee.color : '#2563eb',
        activities,
        unattachedTasks: activities.length ? [] : [...new Set(employee.taskNumbers || [])].map(clean),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return { project: clean(state.projectName || 'Projeto'), generatedAt: now.toISOString(), members };
  }

  async function createPdf(report) {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(.12, .22, .36), muted = rgb(.40, .46, .55), lineColor = rgb(.87, .90, .94);
    const pageWidth = 595.28, pageHeight = 841.89, margin = 44, bottom = 56, contentWidth = pageWidth - margin * 2;
    const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(report.generatedAt));
    const measureCanvas = document.createElement('canvas');
    const measureContext = measureCanvas.getContext('2d');
    let page, y, activeMember = null, activeArea = null;

    // Keep Portuguese text searchable; render only unsupported scripts through
    // the browser's Unicode fonts instead of losing characters in a member name.
    function measure(text, size, font) {
      try { return font.widthOfTextAtSize(text, size); }
      catch {
        measureContext.font = `${font === bold ? 'bold ' : ''}${size}px Arial, sans-serif`;
        return measureContext.measureText(text).width;
      }
    }

    function wrap(value, width, size, font = regular) {
      const words = clean(value).split(/\s+/).filter(Boolean), lines = [];
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (measure(candidate, size, font) <= width) { current = candidate; continue; }
        if (current) { lines.push(current); current = ''; }
        if (measure(word, size, font) <= width) { current = word; continue; }
        for (const character of [...word]) {
          if (current && measure(current + character, size, font) > width) { lines.push(current); current = ''; }
          current += character;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [''];
    }

    function oneLine(value, width, size, font = regular) {
      let text = clean(value);
      if (measure(text, size, font) <= width) return text;
      while (text && measure(text + '...', size, font) > width) text = [...text].slice(0, -1).join('');
      return text + '...';
    }

    async function drawText(text, x, baseline, size, font = regular, color = ink) {
      try {
        font.encodeText(text);
        page.drawText(text, { x, y: baseline, size, font, color });
      } catch {
        const scale = 3, width = Math.ceil(measure(text, size, font) + 2), height = Math.ceil(size * 1.6);
        const canvas = document.createElement('canvas');
        canvas.width = width * scale; canvas.height = height * scale;
        const context = canvas.getContext('2d'); context.scale(scale, scale);
        context.font = `${font === bold ? 'bold ' : ''}${size}px Arial, sans-serif`;
        context.fillStyle = `rgb(${Math.round(color.red * 255)},${Math.round(color.green * 255)},${Math.round(color.blue * 255)})`;
        context.fillText(text, 0, size * 1.15);
        const image = await pdf.embedPng(canvas.toDataURL('image/png'));
        page.drawImage(image, { x, y: baseline - height + size * 1.15, width, height });
      }
    }

    async function newPage() {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      if (pdf.getPageCount() > 1) {
        await drawText('RESULTADOS DA DAILY', margin, y - 10, 9, bold, muted);
        const shortName = oneLine(report.project, contentWidth - 145, 9);
        await drawText(shortName, margin + 145, y - 10, 9, regular, muted);
        page.drawLine({ start: { x: margin, y: y - 22 }, end: { x: pageWidth - margin, y: y - 22 }, thickness: .7, color: lineColor });
        y -= 42;
        if (activeMember) {
          for (const textLine of wrap(`Continuação: ${activeMember}`, contentWidth, 10, bold)) {
            await drawText(textLine, margin, y - 10, 10, bold, ink);
            y -= 15;
          }
          if (activeArea) {
            for (const textLine of wrap(`Área: ${activeArea}`, contentWidth, 9)) {
              await drawText(textLine, margin, y - 9, 9, regular, muted);
              y -= 13;
            }
          }
          y -= 10;
        }
      }
    }

    async function ensureSpace(height) { if (y - height < bottom) await newPage(); }
    async function textBlock(text, { size = 10, font = regular, color = ink, indent = 0, after = 6 } = {}) {
      const leading = size * 1.45;
      for (const textLine of wrap(text, contentWidth - indent, size, font)) {
        await ensureSpace(leading);
        await drawText(textLine, margin + indent, y - size, size, font, color);
        y -= leading;
      }
      y -= after;
    }

    await newPage();
    await textBlock('MAPA DAILY / RESULTADOS', { size: 9, font: bold, color: muted, after: 12 });
    await textBlock(report.project, { size: 24, font: bold, after: 4 });
    await textBlock(`Resumo das atividades da equipe - ${date}`, { size: 10, color: muted, after: 16 });
    const active = report.members.filter(member => member.activities.length).length;
    const tasks = report.members.reduce((sum, member) => sum + new Set([...member.activities.flatMap(activity => activity.tasks), ...member.unattachedTasks]).size, 0);
    await textBlock(`${report.members.length} membros  |  ${active} em atuação  |  ${tasks} tarefas registradas`, { size: 10, font: bold, after: 20 });

    if (!report.members.length) await textBlock('Nenhum membro da equipe cadastrado.', { size: 11, color: muted });
    for (const member of report.members) {
      activeMember = null;
      activeArea = null;
      const nameLines = wrap(member.name, contentWidth - 18, 14, bold);
      const departmentLines = member.department ? wrap(member.department, contentWidth - 18, 9) : [];
      await ensureSpace(nameLines.length * 20 + departmentLines.length * 14 + 62);
      activeMember = member.name;
      page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: .7, color: lineColor });
      y -= 16;
      const accent = rgb(parseInt(member.color.slice(1, 3), 16) / 255, parseInt(member.color.slice(3, 5), 16) / 255, parseInt(member.color.slice(5, 7), 16) / 255);
      page.drawCircle({ x: margin + 3, y: y - 7, size: 3, color: accent });
      await textBlock(member.name, { size: 14, font: bold, indent: 16, after: 2 });
      if (member.department) await textBlock(member.department, { size: 9, color: muted, indent: 16, after: 10 });

      if (!member.activities.length) {
        await textBlock('Sem área vinculada no momento.', { color: muted, indent: 16 });
        if (member.unattachedTasks.length) await textBlock(`Tarefas registradas sem área: ${member.unattachedTasks.join(', ')}`, { indent: 16 });
      }
      for (let index = 0; index < member.activities.length; index++) {
        const activity = member.activities[index];
        const areaLabel = `${index + 1}. ${activity.area}`;
        activeArea = null;
        await ensureSpace(wrap(areaLabel, contentWidth - 16, 11, bold).length * 16 + 32);
        activeArea = activity.area;
        await textBlock(areaLabel, { size: 11, font: bold, indent: 16, after: 2 });
        await textBlock(activity.tasks.length ? `Tarefas: ${activity.tasks.join(', ')}` : 'Sem tarefa informada.', { size: 10, indent: 30, color: muted, after: 12 });
        activeArea = null;
      }
      y -= 6;
    }

    const pages = pdf.getPages();
    for (let index = 0; index < pages.length; index++) {
      page = pages[index];
      page.drawLine({ start: { x: margin, y: 40 }, end: { x: pageWidth - margin, y: 40 }, thickness: .7, color: lineColor });
      await drawText(`Gerado em ${date} - horário de Brasília`, margin, 25, 8, regular, muted);
      const label = `${index + 1} / ${pages.length}`;
      await drawText(label, pageWidth - margin - measure(label, 8, regular), 25, 8, regular, muted);
    }
    pdf.setTitle(`Resultados - ${report.project}`);
    pdf.setAuthor('Mapa Daily');
    pdf.setSubject('Áreas e tarefas de cada membro da equipe');
    pdf.setCreationDate(new Date(report.generatedAt));
    return pdf.save();
  }

  async function download(state) {
    const report = snapshot(state);
    const bytes = await createPdf(report);
    const filename = report.project.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'projeto';
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(report.generatedAt)).replaceAll('/', '-');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `daily_${filename}_${date}.pdf`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { snapshot, createPdf, download };
})();
