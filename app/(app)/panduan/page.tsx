import { BOARD_COLORS } from '@/lib/backlog';
import { BALL_OWNER, STATUS_ORDER } from '@/lib/config';
import { getDb, requireUser } from '@/lib/session';
import { StatusBadge } from '@/components/ui';

export const metadata = { title: 'Guide' };

const ROLES = [
  {
    role: 'Brand PIC',
    who: 'Dennis, Aliza, Brama (Menswear); Dea, Tiwi, Zahra, Mey (Womenswear)',
    tasks: 'Fill in the request form; complete the brief when asked; review drafts and reply ACC or REV (on the web or WhatsApp).',
    wa: 'Request received + ticket ID; brief needs more info; draft ready for review; final file ready.',
  },
  {
    role: 'Traffic',
    who: 'Evi (Menswear), Nadia Syifa (Womenswear)',
    tasks: 'Check the brief is complete and confirm the deadline (one by one or several at once from the Requests list); monitor their group’s tickets; close tickets once the final file is in.',
    wa: 'New requests; URGENT requests; overdue tasks; morning digest.',
  },
  {
    role: 'Division lead',
    who: 'Hamzah Benoti & Ahmad Husen (photo), Aulia Pramudya (design, moodboard, 3D), Ilham Almando (video), Salsa Rosyidah (styling)',
    tasks: 'Assign members (design is picked automatically and can be changed); QC drafts before they go to the brand.',
    wa: 'New tasks in their division; drafts waiting for QC; members’ overdue tasks.',
  },
  {
    role: 'Creative team',
    who: 'Photographer, photo editor, designer, videographer, stylist, assistant studio, intern',
    tasks: 'Work on tasks; upload a draft link for each version; handle revisions; upload the final file link.',
    wa: 'New tasks; reminders 2 days before, 1 day before and on the deadline; incoming revision notes.',
  },
  {
    role: 'Creative Head & Head of Creative Production',
    who: 'Ammar Habibullah, Abdul Malik, Daniel Pranata',
    tasks: 'Monitor the dashboard; change priorities/deadlines when they clash. Admins can delete (archive) tasks and restore them from the Tracker’s Deleted tab.',
    wa: 'Overdue escalations; weekly recap.',
  },
];

export default async function PanduanPage() {
  await requireUser();
  const db = await getDb();
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Guide</h1>
          <p>The flow from form to final: who does what at each stage.</p>
        </div>
      </div>

      <h2 className="section-title">
        <span className="num">1</span> Workflow
      </h2>
      <div className="frame">
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>
            The <b>brand PIC</b> fills in the request form → the system creates a <b>ticket ID</b> and notifies the PIC & Traffic via WhatsApp.
          </li>
          <li>
            <b>Traffic</b> checks the brief. Incomplete → back to the PIC. Complete → the system splits the request into tasks per division (automatic routing). A request with a quantity field (Jumlah foto/desain/video/output) is split into that many separate tasks. Traffic can approve or reject several requests at once from the Requests list.
          </li>
          <li>
            The <b>division lead</b> picks a member (graphic design is assigned automatically to the designer with the lightest load).
          </li>
          <li>
            The <b>creative team</b> does the work and uploads a draft link → <b>lead QC</b>. Not passed → back to production.
          </li>
          <li>
            QC passed → the <b>brand PIC</b> reviews and replies <b>ACC</b> or <b>REV</b>. REV → back to production (revisions are logged per round).
          </li>
          <li>
            ACC → the assignee uploads the <b>final file</b> to Drive → <b>Traffic</b> closes the ticket → it shows up on the dashboard.
          </li>
        </ol>
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }} className="muted">
          <li>
            Each task gets a health label based on days left until the deadline: <b>ON TRACK</b> (3+ days), <b>URGENT</b> (0–2
            days), <b>VERY URGENT</b> (1 day late), <b>OVERDUE</b> (2 days late), <b>CRITICAL</b> (3+ days late, escalate).
          </li>
          <li>Red badges in the sidebar show new items since you last opened Requests, Tracker or Dashboard.</li>
        </ul>
      </div>

      <h2 className="section-title">
        <span className="num">2</span> Reply via WhatsApp
      </h2>
      <div className="frame">
        <p style={{ marginTop: 0 }}>When a draft is ready for review, the PIC gets a WhatsApp message (in Indonesian) and just replies:</p>
        <pre className="pre" style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 4 }}>
          {`ACC CR-2610-001-DG\nREV CR-2610-001-DG warna background lebih terang, logo diperbesar`}
        </pre>
        <p className="muted">Anything after the ID on a REV line is the revision note. Use the request ID (e.g. CR-2610-001) to answer all of that request’s tasks waiting for review at once.</p>
      </div>

      <h2 className="section-title">
        <span className="num">3</span> Roles
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>People</th>
              <th>Tasks in the system</th>
              <th>WhatsApp notifications</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r.role}>
                <td className="title">{r.role}</td>
                <td>{r.who}</td>
                <td>{r.tasks}</td>
                <td>{r.wa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">
        <span className="num">4</span> The 11 standard statuses
      </h2>
      <div className="frame">
        <div className="row" style={{ gap: 10 }}>
          {STATUS_ORDER.map((s, i) => (
            <span key={s} className="row" style={{ gap: 4 }}>
              <span className="subtle">{i + 1}.</span> <StatusBadge status={s} />
              <span className="subtle">ball with {BALL_OWNER[s]}</span>
            </span>
          ))}
        </div>
      </div>

      <h2 className="section-title">
        <span className="num">5</span> Routing & SLA
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Division</th>
              <th>Lead Menswear</th>
              <th>Lead Womenswear</th>
              <th>Assign</th>
              <th>Min. lead time</th>
              <th>Review buffer</th>
            </tr>
          </thead>
          <tbody>
            {db.master.kategori.map((k, i) => (
              <tr key={i}>
                <td>
                  <span className="badge" style={{ background: BOARD_COLORS[i % 10], color: '#fff' }}>
                    {k.kategori}
                  </span>
                </td>
                <td>{k.divisi}</td>
                <td>{k.leadMenswear}</td>
                <td>{k.leadWomenswear}</td>
                <td>
                  {k.modeAssign}
                  {k.assigneeDefault ? ` → ${k.assigneeDefault}` : ''}
                </td>
                <td>{k.leadTimeMin} working days</td>
                <td>{k.bufferReview} working days</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="subtle">Change routing, SLAs, the team and WhatsApp numbers directly in Google Sheets (the Master_* tabs). The app picks up changes right away.</p>
    </div>
  );
}
