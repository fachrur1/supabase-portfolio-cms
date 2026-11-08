// admin/src/views/profile.js - About & Profile singleton editor (profiles table).
import { el, esc, icons, toast, errorMessage, errorStateHtml, loadingSkeleton, setBusy, renderMarkdown } from '../ui.js';
import { supabase } from '../api.js';
import { schemas } from '../schemas.js';
import { buildForm, buildPayload, previewModal } from '../crud.js';

const config = schemas.profile;

export function renderProfile(container) {
  container.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">About &amp; Profile</h1>
          <p class="page-sub">Hero section, about content and profile photo</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-ghost" data-act="preview" type="button">${icons.eye}<span>Preview</span></button>
          <button class="btn btn-primary" data-act="save" type="button">${icons.check}<span>Save</span></button>
        </div>
      </header>
      <div class="form-region">${loadingSkeleton(4)}</div>
    </div>`;

  const formRegion = container.querySelector('.form-region');
  let form = null;
  let existingId = null;

  const init = async () => {
    formRegion.innerHTML = loadingSkeleton(4);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_primary', true)
      .maybeSingle();

    if (error) {
      formRegion.innerHTML = errorStateHtml(errorMessage(error, 'Could not load the profile.'));
      formRegion.querySelector('[data-act="retry"]').addEventListener('click', init);
      return;
    }

    existingId = data ? data.id : null;
    form = buildForm(config, data || { is_primary: true }, [], {});
    formRegion.innerHTML = '';
    formRegion.appendChild(form.root);
    if (!data) {
      formRegion.insertAdjacentHTML(
        'afterbegin',
        '<div class="notice">No profile exists yet - saving will create the primary profile row.</div>'
      );
    }
  };

  container.querySelector('[data-act="preview"]').addEventListener('click', () => {
    if (!form) return;
    const { values } = form.collect();
    previewModal(config, values, []);
  });

  container.querySelector('[data-act="save"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!form) return;
    const result = form.validate();
    if (!result.ok) {
      toast('Please fix the highlighted fields.', 'error');
      return;
    }
    setBusy(btn, true, 'Saving…');
    const { values } = form.collect();
    const payload = { ...buildPayload(config, values), is_primary: true };

    let response;
    if (existingId) {
      response = await supabase.from('profiles').update(payload).eq('id', existingId).select().single();
    } else {
      response = await supabase.from('profiles').insert(payload).select().single();
    }
    setBusy(btn, false);

    if (response.error) {
      toast(errorMessage(response.error, 'Could not save the profile.'), 'error');
      return;
    }
    existingId = response.data.id;
    toast('Profile saved.');
  });

  init();
}
