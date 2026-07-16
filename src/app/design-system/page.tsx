"use client";

import {
  ArrowRight,
  Bookmark,
  Clock,
  Mail,
  MoreHorizontal,
  Play,
  Settings,
  Volume2,
} from "lucide-react";

import {
  Avatar,
  Badge,
  Button,
  Card,
  ChapterItem,
  Coach,
  IconButton,
  Input,
  LessonCard,
  Logo,
  Mascot,
  ProgressBar,
  SearchBar,
  SpeechBubble,
  Table,
} from "@/components/bmh-ds";

const poses = ["stand", "wave", "present", "point", "thinking", "hips"] as const;
const emotions = [
  "neutral",
  "smile",
  "laugh",
  "curious",
  "thinking",
  "worried",
  "content",
] as const;

const specimenStyle: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--border-card)",
  borderRadius: "var(--bmh-radius-lg)",
  padding: "clamp(18px, 3vw, 28px)",
  boxShadow: "var(--bmh-shadow-sm)",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 12,
};

function Specimen({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={specimenStyle}>
      <h2 style={labelStyle}>{title}</h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "clamp(18px, 4vw, 48px)",
        background: "var(--surface-app)",
        color: "var(--ink-900)",
      }}
    >
      <header style={{ maxWidth: 1180, margin: "0 auto 32px" }}>
        <Logo height={34} />
        <h1
          style={{
            margin: "20px 0 6px",
            fontFamily: "var(--font-display)",
            fontSize: "clamp(32px, 6vw, 52px)",
            fontWeight: 800,
            lineHeight: 1.05,
          }}
        >
          Component library
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: 680,
            fontFamily: "var(--font-body)",
            fontSize: "var(--fs-body-lg)",
            color: "var(--text-body)",
          }}
        >
          Unlinked review surface for the typed BMH Institute design system.
        </p>
      </header>

      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <Specimen title="Button variants and sizes">
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary">Start lesson</Button>
            <Button variant="dark" iconRight={<ArrowRight size={18} />}>
              Get started
            </Button>
            <Button variant="secondary">Save</Button>
            <Button variant="warm">Continue</Button>
            <Button variant="ghost">Skip</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 14,
            }}
          >
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg" iconLeft={<Play size={18} />}>
              Large
            </Button>
          </div>
        </Specimen>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
            gap: 24,
          }}
        >
          <Specimen title="IconButton">
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <IconButton label="Play" variant="solid"><Play size={18} /></IconButton>
              <IconButton label="Bookmark" variant="soft"><Bookmark size={18} /></IconButton>
              <IconButton label="Volume" variant="dark"><Volume2 size={18} /></IconButton>
              <IconButton label="Settings" variant="outline"><Settings size={18} /></IconButton>
              <IconButton label="More" variant="plain"><MoreHorizontal size={18} /></IconButton>
            </div>
          </Specimen>

          <Specimen title="Badge and Avatar">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Badge tone="green" dot>Completed</Badge>
              <Badge tone="yellow">In progress</Badge>
              <Badge tone="blue" icon={<Clock size={12} />}>8 min</Badge>
              <Badge tone="solid" size="sm">Pro</Badge>
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginTop: 20,
              }}
            >
              <Avatar name="Jarrad Miller" />
              <Avatar name="Sofia Ruiz" />
              <Avatar name="Dev Team" size={48} />
            </div>
          </Specimen>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
            gap: 24,
          }}
        >
          <Specimen title="ProgressBar">
            <ProgressBar value={70} showLabel />
            <div style={{ height: 12 }} />
            <ProgressBar value={40} tone="blue" />
          </Specimen>

          <Specimen title="SpeechBubble">
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
              <SpeechBubble>Hi! Let&apos;s explore this topic.</SpeechBubble>
              <SpeechBubble tone="yellow" tail="bottom-right" size="sm">
                Nice, chapter done!
              </SpeechBubble>
            </div>
          </Specimen>
        </div>

        <Specimen title="Card">
          <div style={{ maxWidth: 360 }}>
            <Card interactive>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "var(--ink-900)",
                }}
              >
                Interactive card
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  fontFamily: "var(--font-body)",
                  color: "var(--text-body)",
                }}
              >
                Soft-rounded surface with a hover lift and pop shadow.
              </p>
            </Card>
          </div>
        </Specimen>

        <Specimen title="Table">
          <Table
            columns={[
              { key: "name", label: "Name" },
              { key: "role", label: "Role" },
              { key: "status", label: "Status", align: "right" },
            ]}
            rows={[
              { id: 1, name: "Sofia Ruiz", role: "Acquisitions", status: "Active" },
              { id: 2, name: "Dev Team", role: "Operations", status: "Invited" },
            ]}
            cell={{
              status: (row) => (
                <Badge tone={row.status === "Active" ? "green" : "neutral"}>
                  {row.status}
                </Badge>
              ),
            }}
          />
        </Specimen>

        <Specimen title="Input and SearchBar">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
              gap: 20,
              alignItems: "start",
            }}
          >
            <Input
              label="Work email"
              type="email"
              placeholder="you@bmhgroupkc.com"
              icon={<Mail size={18} />}
            />
            <Input
              label="Password"
              type="password"
              defaultValue="secret"
              error="Must be 8+ characters"
            />
            <Input
              label="Display name"
              defaultValue="Sofia Ruiz"
              hint="Shown on your certificates"
            />
            <SearchBar />
          </div>
        </Specimen>

        <Specimen title="LessonCard and ChapterItem">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))",
              gap: 18,
              alignItems: "start",
            }}
          >
            <LessonCard
              eyebrow="Lesson 5A"
              title="Opening the Call"
              tone="blue"
              pose="wave"
              duration="8:24"
              meta="8 min · 1.2k views"
              progress={40}
            />
            <LessonCard
              eyebrow="Lesson 8A"
              title="Complex Objections"
              tone="navy"
              pose="thinking"
              duration="12:03"
              meta="Pro track"
              locked
              badge={<Badge tone="solid" size="sm">Pro</Badge>}
            />
            <LessonCard
              eyebrow="Lesson 7B"
              title="Objection Scripts Playbook"
              tone="yellow"
              pose="point"
              duration="10:41"
              meta="Just added"
              badge={<Badge tone="orange" size="sm">New</Badge>}
            />
            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--border-card)",
                borderRadius: "var(--bmh-radius-lg)",
                padding: 10,
                boxShadow: "var(--bmh-shadow-sm)",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  padding: "8px 10px 10px",
                  fontFamily: "var(--font-display)",
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                Chapters
              </h3>
              <ChapterItem index={1} title="Evaluation" status="done" />
              <ChapterItem index={2} title="Opening the Call" progress={40} active />
              <ChapterItem index={3} title="Objection Architecture" progress={15} />
              <ChapterItem index={4} title="Seller Financing" meta="9 min" />
              <ChapterItem index={5} title="Complex Objections" status="locked" meta="Pro" />
            </div>
          </div>
        </Specimen>

        <Specimen title="Logo">
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
            <Logo height={34} />
            <Logo height={26} mascot={false} />
          </div>
        </Specimen>

        <Specimen title="Mascot poses and expressions">
          <div style={{ display: "flex", gap: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
            {poses.map((pose) => <Mascot key={pose} pose={pose} height={150} />)}
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "flex-end",
              flexWrap: "wrap",
              marginTop: 24,
            }}
          >
            {emotions.map((emotion) => (
              <Mascot key={emotion} emotion={emotion} height={78} />
            ))}
          </div>
        </Specimen>

        <Specimen title="Coach">
          <div style={{ display: "flex", gap: 40, alignItems: "center", flexWrap: "wrap" }}>
            <Coach
              pose="present"
              message="Lead with the cash offer, then introduce seller financing."
            />
            <Coach
              emotion="laugh"
              tone="yellow"
              side="right"
              size="sm"
              message="Nice, chapter done!"
            />
          </div>
        </Specimen>
      </div>
    </main>
  );
}
