import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// DATA — single source of truth for the 10 strawberries.
// Content pulled directly from ../experiences.html and ../projects.html
// (do not paraphrase here; edit those pages first, then mirror).
//
// Experience berries sit on the ascent in CHRONOLOGICAL order — the climb
// mirrors the career: oldest role at the bottom, current role at the crest.
// Project berries spread across the plaza. Positions come from the anchor
// list documented at the top of world.js.
// ─────────────────────────────────────────────────────────────

export const STRAWBERRIES = [
  // ── Experiences (ascent, oldest → newest going up) ─────────
  {
    id: 'dellicker',
    category: 'experience',
    title: 'Dellicker Strategies',
    subtitle: 'Cybersecurity Intern',
    date: 'Sep 2022 - Jun 2023',
    bullets: [
      'Applied cybersecurity, IT, and project management skills to support security initiatives in a mid-sized company setting',
      'Conducted research on emerging cybersecurity threats, including recent attacks targeting local school systems',
      'Reported threat analysis findings and security recommendations to stakeholders during business meetings',
    ],
    position: { x: -1, y: 7.5, z: -46 }, // B2 roof (h6.5)
  },
  {
    id: 'njit',
    category: 'experience',
    title: 'NJIT Mechatronics Research Lab',
    subtitle: 'Robotics Research Programmer',
    date: 'Oct 2023 - May 2024',
    bullets: [
      'Programmed magnetic whiteboard-climbing robots in C++ to respond to colored light and shadow inputs',
      'Implemented a custom Arduino algorithm computing real-time position from projector-driven sensor data',
      "Presented research at NJIT's Honors Interdisciplinary Research Forum in December 2023",
    ],
    position: { x: -18, y: 13.0, z: -64 }, // B4 roof (h12)
  },
  {
    id: 'pseg',
    category: 'experience',
    title: 'Public Service Enterprise Group (PSEG)',
    subtitle: 'Data Analytics Intern',
    date: 'Jun - Aug 2024',
    bullets: [
      'Built an SQL-connected Power BI dashboard informing multimillion-dollar power grid infrastructure projects',
      'Extracted and transformed 1000s of raw data values via complex SQL queries to evaluate power pole quality',
      'Produced Power BI and Excel visualizations analyzing budget allocation to guide capital project prioritization',
    ],
    position: { x: -7, y: 16.5, z: -70 }, // B5 roof (h15.5)
  },
  {
    id: 'qpc',
    category: 'experience',
    title: 'Quantum Pulse Consulting',
    subtitle: 'Software Engineer Intern',
    date: 'Jan - Apr 2025',
    bullets: [
      'Developed a responsive full-stack web application frontend using React, Tailwind CSS, and Vite',
      'Integrated RESTful APIs with a Django and PostgreSQL backend to enable seamless bidirectional data flow',
      'Shipped 20+ client-requested features including an AI chatbot integration across 8 Agile sprints',
    ],
    position: { x: 11, y: 22.0, z: -88 }, // B7 roof (h21)
  },
  {
    id: 'merck',
    category: 'experience',
    title: 'Merck',
    subtitle: 'Software Engineer Intern',
    date: 'Jun - Aug 2025',
    bullets: [
      'Engineered Python backend workflows with the Signals Notebook API to link template data and run computations',
      'Architected flexible experiment templates digitizing handwritten records with cross-department reuse potential',
      'Accelerated data entry, retrieval, and cross-study comparison by 25%+ by automating multi-report consolidation',
      'Saved 2.5 hours per global R&D PMO meeting by optimizing SharePoint management with Power Automate',
    ],
    position: { x: -13, y: 25.5, z: -93 }, // B9 roof (h24.5)
  },
  {
    id: 'barclays',
    category: 'experience',
    title: 'Barclays',
    subtitle: 'Software Engineer Intern',
    date: 'Jun - Aug 2026',
    bullets: [
      'Delivered tooling for a distributed financial platform, replacing manual dependency tracing across pipelines and events',
      'Coded backend Java logic across event flows to find upstream and downstream impacts using Spring, Tomcat, and PuTTY',
      'Wrote a Plotly.js frontend rendering relationship paths, status states, and structured outputs for faster analysis',
      'Automated generation of 10,000+ synthetic data rows in Python via pandas, SDV, and Faker, preserving referential integrity',
    ],
    position: { x: -16, y: 34.0, z: -114 }, // peak roof (h33) — final summit above the crest
  },

  // ── Projects (plaza) ───────────────────────────────────────
  {
    id: 'candidats',
    category: 'project',
    title: 'CandidATS',
    date: 'March 2026 - May 2026',
    tags: ['Next.js', 'TypeScript', 'Prisma', 'PostgreSQL', 'Docker'],
    link: 'https://candid-ats.vercel.app/',
    bullets: [
      'Designed a multi-tenant applicant tracker on Next.js, TypeScript, Prisma, and PostgreSQL with 35 REST endpoints',
      'Containerized a Tectonic LaTeX-to-PDF microservice with Docker on Fly.io, scaling to zero for 0 idle cost',
      'Created an AI document generator turning Gemini drafts into LaTeX PDFs with live preview and AI editing',
      'Secured per-user authorization with Supabase Auth and JWT cookies, backed by 300+ tests and GitHub Actions CI/CD',
    ],
    position: { x: 10, y: 8.2, z: -144 }, // atop the spiral staircase deck
  },
  {
    id: 'decibel',
    category: 'project',
    title: 'Decibel - Verizon Smart Campus',
    date: 'October 2025 - March 2026',
    tags: ['React Native', 'Expo', 'C++', 'Arduino', 'IoT'],
    link: 'https://decibel-njit.vercel.app',
    bullets: [
      'Captained a 6-member team to win $3,000 against 100+ teams from Northeastern, Rutgers, and NJIT',
      'Built a cross-platform prototype in React Native and Expo with reusable components and state logic',
      'Rendered real-time occupancy and noise data to visualize campus study space availability for commuters',
      'Prototyped Arduino IoT hardware in C++ with sound and IR distance sensors for backend ingestion',
    ],
    position: { x: -13, y: 6.2, z: -151 }, // pavilion roof (Stage 5c layout)
  },
  {
    id: 'athena',
    category: 'project',
    title: 'Athena',
    date: 'September 2025 - October 2025',
    tags: ['Next.js', 'TypeScript', 'MongoDB', 'Gemini API', 'Chart.js'],
    link: 'https://athenas.tech',
    bullets: [
      'Directed a 4-member team to ship a full-stack AI platform in Next.js, TypeScript, and MongoDB',
      'Integrated the Gemini API to generate personalized plans and power an AI mentorship chatbot',
      'Constructed an interactive Chart.js dashboard and managed full deployment on Vercel',
      'Secured user authentication using JWT and bcrypt with reliable frontend-backend communication',
    ],
    position: { x: 13, y: 6.2, z: -158.6 }, // mini tower, off-center of the windmill pole
  },
  {
    id: 'lexicogs',
    category: 'project',
    title: 'Lexicogs',
    date: 'November 2024 - December 2024',
    tags: ['React', 'JavaScript', 'HTML', 'CSS'],
    link: 'https://lexicogs.vercel.app',
    bullets: [
      'Coordinated with a team of 3 at HackNJIT 2024 to create a steampunk-themed word correlation React application',
      'Crafted selective word filtering and timed gameplay logic where players identify target words from a moving dataset',
    ],
    position: { x: -33.2, y: 2.7, z: -150.6 }, // atop the rock cairn south of the west island
  },
];

// ─────────────────────────────────────────────────────────────
// 3D berry system — meshes, category aura, bob/spin, proximity.
// Reads only `position` and `category` from the data above, so content
// edits never require touching this code.
// ─────────────────────────────────────────────────────────────

const AURA_COLOR = {
  experience: 0xe8b64c, // warm gold
  project: 0x3cc4ac,    // cool teal
};

export function createBerrySystem(scene) {
  // Shared geometries/materials (10 berries — instancing not worth the
  // complexity here, but no per-berry geometry duplication either)
  const bodyGeo = new THREE.SphereGeometry(0.42, 7, 6);
  bodyGeo.scale(1, 1.2, 1);
  const leafGeo = new THREE.ConeGeometry(0.3, 0.26, 5);
  const stemGeo = new THREE.BoxGeometry(0.08, 0.16, 0.08);
  const auraGeo = new THREE.SphereGeometry(0.8, 12, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd9453e, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7048, flatShading: true });

  const list = STRAWBERRIES.map((entry, i) => {
    const group = new THREE.Group();

    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.y = 0.55;
    const stem = new THREE.Mesh(stemGeo, leafMat);
    stem.position.y = 0.72;

    const auraMat = new THREE.MeshBasicMaterial({
      color: AURA_COLOR[entry.category],
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);

    group.add(body, leaf, stem, aura);
    group.position.set(entry.position.x, entry.position.y, entry.position.z);
    scene.add(group);

    return {
      entry,
      group,
      auraMat,
      baseY: entry.position.y,
      phase: i * 1.7, // desynchronized bob/pulse per berry
    };
  });

  let t = 0;
  function update(dt) {
    t += dt;
    for (const b of list) {
      b.group.position.y = b.baseY + Math.sin(t * 1.6 + b.phase) * 0.22;
      b.group.rotation.y += dt * 0.9;
      b.auraMat.opacity = 0.17 + (Math.sin(t * 2.2 + b.phase) * 0.5 + 0.5) * 0.13;
    }
  }

  // Nearest berry within `radius` (full 3D distance so a berry on a roof
  // can't be interacted with from directly underneath it)
  function nearest(pos, radius) {
    let best = null;
    let bestDist = radius;
    for (const b of list) {
      const d = b.group.position.distanceTo(pos);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  return { list, update, nearest };
}
