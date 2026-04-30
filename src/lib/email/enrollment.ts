export type EnrollmentEmailInput = {
  inviteeEmail: string;
  appUrl: string;
  programs: Array<{ id: string; title: string }>;
  standaloneCourses: Array<{ id: string; title: string }>;
};

export function renderEnrollmentEmail(input: EnrollmentEmailInput): {
  subject: string;
  html: string;
} {
  const hasAssignments =
    input.programs.length > 0 || input.standaloneCourses.length > 0;

  const subject = hasAssignments
    ? `You're enrolled in ${summarizeCount(input)} at BMH Institute`
    : "You're invited to BMH Institute";

  const itemsHtml = hasAssignments
    ? `<p>You'll have access to the following when you sign in:</p>
       ${input.programs.length > 0 ? programList(input.programs) : ""}
       ${
         input.standaloneCourses.length > 0
           ? courseList(input.standaloneCourses)
           : ""
       }`
    : `<p>You're getting set up with access to BMH Group's internal training platform. An admin will assign your first program shortly.</p>`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
      <h1 style="font-size:22px;margin:0 0 16px;">Welcome to BMH Institute</h1>
      <p>Hi there,</p>
      ${itemsHtml}
      <p style="margin-top:24px;">
        <a href="${escapeAttr(input.appUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
          Open BMH Institute
        </a>
      </p>
      <p style="color:#666;font-size:12px;margin-top:32px;">
        This email was sent to ${escapeHtml(input.inviteeEmail)} because an admin invited you to BMH Institute.
      </p>
    </div>
  `.trim();

  return { subject, html };
}

function programList(programs: Array<{ id: string; title: string }>): string {
  return `
    <h2 style="font-size:16px;margin:16px 0 8px;">Programs</h2>
    <ul style="padding-left:20px;">
      ${programs.map((p) => `<li>${escapeHtml(p.title)}</li>`).join("")}
    </ul>
  `.trim();
}

function courseList(courses: Array<{ id: string; title: string }>): string {
  return `
    <h2 style="font-size:16px;margin:16px 0 8px;">Courses</h2>
    <ul style="padding-left:20px;">
      ${courses.map((c) => `<li>${escapeHtml(c.title)}</li>`).join("")}
    </ul>
  `.trim();
}

function summarizeCount(input: EnrollmentEmailInput): string {
  const progs = input.programs.length;
  const courses = input.standaloneCourses.length;
  if (progs > 0 && courses > 0) {
    return `${progs} ${progs === 1 ? "program" : "programs"} and ${courses} ${courses === 1 ? "course" : "courses"}`;
  }
  if (progs > 0) {
    return progs === 1 ? "a new program" : `${progs} programs`;
  }
  return courses === 1 ? "a new course" : `${courses} courses`;
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(v: string): string {
  return escapeHtml(v);
}
