/**
 * Career benchmark corpus — 20 résumé / job-description pairs.
 *
 * These are AUTHORED fixtures, not real documents. They cannot tell you anything about
 * real-world extraction failures (scanned PDFs, exotic templates, multi-column layouts);
 * for that you need real files. What they DO give you is a fixed, diverse population to
 * measure advisor behaviour against, so "is the tool good?" stops being an opinion formed
 * from whichever single résumé happened to be open.
 *
 * Coverage is deliberately weighted AWAY from software: most résumé tooling is tuned on
 * engineering CVs and quietly fails everyone else. Each pair also carries the honest
 * ground truth we can assert mechanically — which JD terms the résumé genuinely has no
 * evidence for. Nothing in the tool may ever propose inserting one of those.
 */

export interface BenchmarkPair {
  id: string;
  /** What this pair is meant to stress. */
  archetype: string;
  resume: string;
  jd: string;
  /**
   * Terms the JD asks for that this résumé provides NO evidence of. A suggestion whose
   * applied text introduces one of these is fabricating a credential.
   */
  unsupportedTerms: string[];
}

export const BENCHMARK_PAIRS: BenchmarkPair[] = [
  {
    id: 'cs-to-csm',
    archetype: 'career pivot, weak constructions, no metrics',
    resume: `Jane Okafor
jane.okafor@example.com | 555-0100

EXPERIENCE
Customer Service Representative - GC Services
2021 - Present
Responsible for handling inbound customer calls
Trained new hires on company systems
Was responsible for maintaining reports in Excel

Sales Representative - iQor
2019 - 2021
Achieved a 60% close rate on outbound calls
Organized the supply closet

SKILLS
Excel, Customer Service`,
    jd: `Senior Customer Success Manager.
Required: SQL, Salesforce, data analysis, customer retention, stakeholder communication.
Must have experience with reporting dashboards and process improvement.
Preferred: team leadership, onboarding and training experience.`,
    unsupportedTerms: ['sql', 'salesforce'],
  },
  {
    id: 'newgrad-swe',
    archetype: 'new graduate, thin experience, projects only',
    resume: `Marcus Lin
marcus.lin@example.com

EDUCATION
B.S. Computer Science, State University, 2025

PROJECTS
Built a recipe-sharing web app using React and Node
Wrote a Python script to scrape and clean public transit data

EXPERIENCE
Teaching Assistant - State University
2024 - 2025
Held weekly office hours for 40 students in the intro programming course
Graded assignments and gave written feedback`,
    jd: `Junior Software Engineer.
Required: JavaScript, React, REST APIs, Git.
Preferred: Kubernetes, AWS, CI/CD pipelines, PostgreSQL.`,
    unsupportedTerms: ['kubernetes', 'aws'],
  },
  {
    id: 'senior-backend',
    archetype: 'strong senior IC, already quantified',
    resume: `Priya Raman
priya@example.com

EXPERIENCE
Senior Backend Engineer - Northwind Systems
2020 - Present
Led the migration of 40 services from monolith to Kubernetes, cutting deploy time 65%
Authored the PostgreSQL sharding strategy now serving 12M daily requests
Mentored four engineers through promotion

Backend Engineer - Datagrove
2017 - 2020
Built the billing reconciliation pipeline in Python
Reduced on-call pages 30% by adding structured logging`,
    jd: `Staff Engineer.
Required: distributed systems, Kubernetes, PostgreSQL, Python, mentorship.
Preferred: Go, event-driven architecture, cost optimization.`,
    unsupportedTerms: ['go'],
  },
  {
    id: 'retail-to-ops',
    archetype: 'retail management, transferable but differently worded',
    resume: `Dwayne Feliciano
dwayne.f@example.com

EXPERIENCE
Store Manager - Brightway Retail
2018 - Present
Responsible for a team of 22 associates across two locations
Cut shrink from 2.1% to 0.8% over two years
Was responsible for scheduling, hiring, and weekly inventory counts

Assistant Manager - Brightway Retail
2016 - 2018
Handled customer escalations and register reconciliation`,
    jd: `Operations Manager.
Required: team leadership, inventory management, process improvement, scheduling.
Must have experience with P&L responsibility and vendor negotiation.`,
    unsupportedTerms: ['p&l', 'vendor negotiation'],
  },
  {
    id: 'nurse-educator',
    archetype: 'healthcare, dense domain vocabulary',
    resume: `Alina Sokolova, RN
alina.s@example.com

EXPERIENCE
Registered Nurse, Medical-Surgical Unit - Mercy General
2019 - Present
Precepted 14 new graduate nurses through unit orientation
Led the unit's falls-reduction initiative, lowering incidents 22%
Charge nurse for a 32-bed unit on rotating shifts

LICENSES
RN, state license, active. BLS and ACLS certified.`,
    jd: `Clinical Nurse Educator.
Required: preceptorship, curriculum development, adult learning principles, BLS/ACLS.
Preferred: simulation lab experience, Master's in Nursing Education.`,
    unsupportedTerms: ['curriculum development', 'simulation lab'],
  },
  {
    id: 'veteran-logistics',
    archetype: 'military-to-civilian translation, acronym heavy',
    resume: `Travis Mbeki
tmbeki@example.com

EXPERIENCE
Motor Transport Operator, U.S. Army
2018 - 2024
Managed dispatch and maintenance schedules for a fleet of 45 vehicles
Accountable for $2.3M of equipment with zero losses across three deployments
Supervised a section of 9 soldiers
Coordinated convoy movements across multiple forward operating bases`,
    jd: `Logistics Coordinator.
Required: fleet management, inventory accountability, scheduling, team supervision.
Preferred: SAP, warehouse management systems, forklift certification.`,
    unsupportedTerms: ['sap', 'forklift'],
  },
  {
    id: 'teacher-to-id',
    archetype: 'education to corporate, no metrics anywhere',
    resume: `Rosa Delgado
rosa.delgado@example.com

EXPERIENCE
High School Biology Teacher - Lincoln High
2017 - Present
Responsible for designing lesson plans and assessments for five sections
Was responsible for mentoring two student teachers
Created lab curriculum adopted by the district science department
Ran professional development workshops for department colleagues`,
    jd: `Instructional Designer.
Required: curriculum design, adult learning, assessment design, stakeholder collaboration.
Preferred: Articulate Storyline, LMS administration, video production.`,
    unsupportedTerms: ['articulate storyline', 'lms'],
  },
  {
    id: 'accountant-analyst',
    archetype: 'finance, tool-name dense',
    resume: `Kenji Watanabe
kenji.w@example.com

EXPERIENCE
Staff Accountant - Halcyon Group
2020 - Present
Closed monthly books for three entities within a four-day close
Built Excel models reconciling intercompany transactions
Automated the AP aging report, saving roughly 10 hours per month

Bookkeeper - Sato & Co
2018 - 2020
Managed accounts payable and receivable for 40 small-business clients`,
    jd: `Financial Analyst.
Required: financial modeling, Excel, variance analysis, month-end close.
Preferred: SQL, Tableau, NetSuite, forecasting.`,
    unsupportedTerms: ['tableau', 'netsuite'],
  },
  {
    id: 'warehouse-supply',
    archetype: 'hourly to analyst, minimal formatting',
    resume: `Sam Boateng
sboateng@example.com

WORK HISTORY
Warehouse Lead - Cardinal Distribution
2019 - Present
Ran cycle counts and reconciled discrepancies in the WMS
Trained seasonal staff each peak season
Cut pick errors by a third after redesigning the bin layout

Forklift Operator - Cardinal Distribution
2017 - 2019
Loaded and staged outbound freight`,
    jd: `Supply Chain Analyst.
Required: inventory analysis, warehouse operations, data analysis, Excel.
Preferred: SQL, demand forecasting, Six Sigma.`,
    unsupportedTerms: ['sql', 'six sigma'],
  },
  {
    id: 'designer-product',
    archetype: 'creative, portfolio-driven, tool names',
    resume: `Nour Haddad
nour.haddad@example.com

EXPERIENCE
Graphic Designer - Studio Vermilion
2019 - Present
Designed brand systems for 30+ small business clients
Rebuilt the studio's Figma component library, cutting handoff revisions in half
Ran client presentations and design reviews

SKILLS
Figma, Illustrator, Photoshop, InDesign`,
    jd: `Product Designer.
Required: Figma, design systems, user research, prototyping, cross-functional collaboration.
Preferred: usability testing, accessibility standards, front-end familiarity.`,
    unsupportedTerms: ['user research', 'usability testing'],
  },
  {
    id: 'analyst-scientist',
    archetype: 'adjacent-skill trap: queried vs authored',
    resume: `Ibrahim Toure
ibrahim.t@example.com

EXPERIENCE
Data Analyst - Meridian Health
2020 - Present
Queried the reporting database to build weekly operations dashboards
Automated recurring reports, saving the team 6 hours a week
Presented findings to clinical leadership monthly

SKILLS
Excel, Tableau, statistics`,
    jd: `Data Scientist.
Required: Python, SQL, statistical modeling, machine learning, data visualization.
Preferred: A/B testing, cloud data warehouses.`,
    unsupportedTerms: ['python', 'machine learning'],
  },
  {
    id: 'admin-exec',
    archetype: 'administrative, heavy passive voice',
    resume: `Bethany Cross
bcross@example.com

EXPERIENCE
Administrative Assistant - Kestrel Partners
2019 - Present
Responsible for calendar management for four directors
Was responsible for booking domestic and international travel
Responsible for processing expense reports and invoices
Coordinated quarterly all-hands logistics for 120 staff`,
    jd: `Executive Assistant.
Required: complex calendar management, travel coordination, expense reporting, discretion.
Preferred: board meeting preparation, Concur, event planning.`,
    unsupportedTerms: ['concur', 'board meeting'],
  },
  {
    id: 'cook-manager',
    archetype: 'food service, no sections, run-on formatting',
    resume: `Luis Arredondo
luis.a@example.com

EXPERIENCE
Line Cook - Casa Marisol
2018 - Present
Ran the saute station on the busiest weekend shifts
Trained four new cooks on station setup and ticket timing
Helped cut food waste by tightening prep par levels

Prep Cook - Casa Marisol
2016 - 2018
Handled opening prep and receiving deliveries`,
    jd: `Restaurant Manager.
Required: staff supervision, food cost control, scheduling, health code compliance.
Preferred: POS systems, labor budgeting, vendor relationships.`,
    unsupportedTerms: ['pos systems', 'labor budgeting'],
  },
  {
    id: 'callcenter-hr',
    archetype: 'lateral pivot, soft skills only',
    resume: `Chidinma Eze
chidinma.eze@example.com

EXPERIENCE
Call Center Team Lead - Vantage Support
2020 - Present
Coached a team of 12 agents on call quality and de-escalation
Ran onboarding for every new agent cohort
Reduced average handle time 18% without hurting satisfaction scores

Customer Support Agent - Vantage Support
2018 - 2020
Resolved billing and account issues across phone and chat`,
    jd: `HR Generalist.
Required: onboarding, employee relations, coaching, confidentiality.
Preferred: HRIS administration, benefits administration, FMLA knowledge.`,
    unsupportedTerms: ['hris', 'fmla', 'benefits administration'],
  },
  {
    id: 'qa-automation',
    archetype: 'manual to automation, tool gap',
    resume: `Grigor Petrosyan
grigor.p@example.com

EXPERIENCE
QA Analyst - Solstice Software
2019 - Present
Wrote and executed manual test plans across three product lines
Filed and triaged roughly 400 defects per release cycle
Built out the regression checklist now used by the whole team

SKILLS
Jira, TestRail, manual testing`,
    jd: `QA Automation Engineer.
Required: test automation, Selenium, Python or Java, CI/CD integration.
Preferred: API testing, performance testing, Docker.`,
    unsupportedTerms: ['selenium', 'docker', 'java'],
  },
  {
    id: 'marketing-manager',
    archetype: 'marketing, metrics present but vague',
    resume: `Talia Bergstrom
talia.b@example.com

EXPERIENCE
Marketing Coordinator - Wavelength Media
2021 - Present
Grew the company newsletter from 3,000 to 11,000 subscribers
Managed the social content calendar across four channels
Coordinated with design and sales on campaign launches

SKILLS
Mailchimp, Hootsuite, Canva, Google Analytics`,
    jd: `Marketing Manager.
Required: campaign management, email marketing, analytics, cross-team coordination.
Preferred: paid acquisition, marketing automation, budget ownership.`,
    unsupportedTerms: ['paid acquisition', 'budget ownership'],
  },
  {
    id: 'writer-strategist',
    archetype: 'freelance, non-linear history',
    resume: `Owen Mackintosh
owen.m@example.com

EXPERIENCE
Freelance Writer - Self-employed
2019 - Present
Wrote long-form features for eight trade publications
Ghostwrote executive thought-leadership for two SaaS founders
Built and maintained an editorial calendar across concurrent clients

Staff Writer - Fenmore Local
2017 - 2019
Covered the municipal beat on daily deadline`,
    jd: `Content Strategist.
Required: editorial planning, long-form writing, audience research, SEO.
Preferred: content analytics, CMS administration, brand voice development.`,
    unsupportedTerms: ['seo', 'cms'],
  },
  {
    id: 'helpdesk-sysadmin',
    archetype: 'IT ladder step, acronym soup',
    resume: `Devon Pritchard
devon.p@example.com

EXPERIENCE
IT Help Desk Technician - Ridgeline Corp
2020 - Present
Resolved roughly 60 tickets a week across hardware and account issues
Imaged and deployed 200 laptops during the office refresh
Wrote internal documentation for the top 20 recurring issues

SKILLS
Active Directory, Windows, ticketing systems`,
    jd: `Systems Administrator.
Required: Active Directory, Windows Server, backup and recovery, scripting.
Preferred: PowerShell, VMware, Linux, network troubleshooting.`,
    unsupportedTerms: ['powershell', 'vmware', 'linux'],
  },
  {
    id: 'socialwork-case',
    archetype: 'social services, compliance vocabulary',
    resume: `Marisol Quintero, MSW
marisol.q@example.com

EXPERIENCE
Social Worker - County Family Services
2018 - Present
Carried a caseload of 45 families with monthly in-home visits
Coordinated services across housing, medical, and school systems
Maintained case documentation meeting state audit standards

EDUCATION
Master of Social Work, State University`,
    jd: `Case Manager.
Required: caseload management, service coordination, case documentation, client advocacy.
Preferred: motivational interviewing, crisis intervention, bilingual Spanish.`,
    unsupportedTerms: ['motivational interviewing', 'bilingual spanish'],
  },
  {
    id: 'construction-pm',
    archetype: 'trades to management, dollar figures present',
    resume: `Hank Osterlund
hank.o@example.com

EXPERIENCE
Site Foreman - Bracken Construction
2017 - Present
Ran daily crews of 15 to 30 on commercial builds up to $8M
Kept three consecutive projects on schedule through supply delays
Held weekly safety briefings with a zero lost-time record

Carpenter - Bracken Construction
2012 - 2017
Framed and finished commercial interiors`,
    jd: `Construction Project Manager.
Required: schedule management, subcontractor coordination, budget tracking, safety compliance.
Preferred: Procore, RFI management, LEED familiarity.`,
    unsupportedTerms: ['procore', 'leed', 'rfi'],
  },
];
