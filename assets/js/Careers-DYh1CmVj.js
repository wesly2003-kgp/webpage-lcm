import { j as e, m as y } from "./framer-motion-5UJVrniw.js";
import { a as d } from "./react-vendor-CFxXJm7r.js";
import { R as H, S as Ie, L as z, M as O } from "./main-BkwBQThB.js";

const jobListings = [{
    title: "Mechanical Design Engineer",
    department: "Engineering",
    location: "Bengaluru, Karnataka",
    type: "Full-time",
    description: "Design and develop mechanical components for the LCM system. Work closely with the hardware team to iterate on prototype designs and prepare parts for manufacturing.",
    requirements: [
        "B.E/B.Tech in Mechanical Engineering",
        "Experience with CAD tools (SolidWorks / CATIA / Fusion 360)",
        "Knowledge of automotive-grade manufacturing processes",
        "Strong problem-solving and prototyping skills"
    ]
}, {
    title: "Electrical & Electronics Engineer",
    department: "Engineering",
    location: "Bengaluru, Karnataka",
    type: "Full-time",
    description: "Design power electronics circuits, BMS integration systems, and electrical wiring for LCM modules. Conduct testing and validation of electrical subsystems.",
    requirements: [
        "B.E/B.Tech in Electrical or Electronics Engineering",
        "Experience with BMS, power electronics, or EV systems",
        "Proficiency in circuit simulation tools (LTSpice / MATLAB)",
        "Hands-on experience with embedded systems is a plus"
    ]
}, {
    title: "Business Development Associate",
    department: "Business",
    location: "Bengaluru, Karnataka",
    type: "Full-time",
    description: "Identify and develop strategic partnerships with OEMs, investors, and industry stakeholders. Support go-to-market strategy and represent LCM at industry events.",
    requirements: [
        "MBA or equivalent experience in business development",
        "Understanding of the EV and automotive industry",
        "Strong communication and negotiation skills",
        "Experience in B2B sales or strategic partnerships"
    ]
}, {
    title: "Frontend Developer (React)",
    department: "Technology",
    location: "Remote / Bengaluru",
    type: "Full-time",
    description: "Build and maintain LCM's web presence including the marketing website, dashboards, and internal tools. Work in a fast-paced startup environment with direct ownership.",
    requirements: [
        "Proficiency in React, TypeScript, and Tailwind CSS",
        "Experience with animation libraries (Framer Motion preferred)",
        "Strong eye for design and UI/UX best practices",
        "Familiarity with Vite and modern build tools"
    ]
}];

const perks = [{
    icon: "🚀",
    title: "Mission-Driven Work",
    description: "Work on technology that directly impacts the future of sustainable transportation."
}, {
    icon: "🧠",
    title: "Ownership & Impact",
    description: "Early team members have real ownership over their domain with direct impact on the company's direction."
}, {
    icon: "💡",
    title: "Innovation Culture",
    description: "We encourage bold ideas, rapid experimentation, and learning from failures."
}, {
    icon: "🌍",
    title: "Sustainability First",
    description: "Everything we build is designed with a net-positive environmental impact in mind."
}];

const JobCard = ({ job, index }) => {
    const [isOpen, setIsOpen] = d.useState(false);

    return e.jsxs(y.div, {
        initial: { opacity: 0, y: 30 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, delay: index * 0.1 },
        className: "bg-dark-800 border border-white/10 rounded-2xl overflow-hidden hover:border-primary-500/30 transition-all duration-300",
        children: [
            e.jsxs("div", {
                className: "p-6 cursor-pointer",
                onClick: () => setIsOpen(!isOpen),
                children: [
                    e.jsxs("div", {
                        className: "flex flex-col md:flex-row md:items-center justify-between gap-4",
                        children: [
                            e.jsxs("div", {
                                children: [
                                    e.jsx("h3", {
                                        className: "font-display font-semibold text-xl text-white mb-2",
                                        children: job.title
                                    }),
                                    e.jsxs("div", {
                                        className: "flex flex-wrap gap-2",
                                        children: [
                                            e.jsx("span", {
                                                className: "inline-block px-3 py-1 text-xs font-medium bg-primary-500/20 text-primary-300 rounded-full",
                                                children: job.department
                                            }),
                                            e.jsx("span", {
                                                className: "inline-block px-3 py-1 text-xs font-medium bg-white/10 text-white/70 rounded-full",
                                                children: job.location
                                            }),
                                            e.jsx("span", {
                                                className: "inline-block px-3 py-1 text-xs font-medium bg-secondary-500/20 text-secondary-300 rounded-full",
                                                children: job.type
                                            })
                                        ]
                                    })
                                ]
                            }),
                            e.jsx("button", {
                                className: "self-start md:self-center px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                                onClick: (ev) => { ev.stopPropagation(); setIsOpen(!isOpen); },
                                children: isOpen ? "Hide Details" : "View Details"
                            })
                        ]
                    })
                ]
            }),
            isOpen && e.jsxs("div", {
                className: "px-6 pb-6 border-t border-white/10 pt-4",
                children: [
                    e.jsx("p", { className: "text-white/70 mb-4 leading-relaxed", children: job.description }),
                    e.jsx("h4", { className: "font-display font-semibold text-white mb-3", children: "Requirements" }),
                    e.jsx("ul", {
                        className: "space-y-2 mb-6",
                        children: job.requirements.map((req, i) =>
                            e.jsxs("li", {
                                className: "flex items-start text-white/70",
                                children: [
                                    e.jsx("span", { className: "h-2 w-2 bg-primary-500 rounded-full mr-3 mt-2 flex-shrink-0" }),
                                    req
                                ]
                            }, i)
                        )
                    }),
                    e.jsxs("a", {
                        href: `mailto:loopchargingmodule@lcmev.com?subject=Application for ${job.title}`,
                        className: "inline-flex items-center bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-full font-medium transition-colors",
                        children: [
                            e.jsx(Ie, { className: "mr-2 h-4 w-4" }),
                            "Apply Now"
                        ]
                    })
                ]
            })
        ]
    });
};

const CareersPage = () => {
    return e.jsx("div", {
        className: "min-h-screen bg-dark-900",
        children: e.jsxs("div", {
            children: [
                // Hero section
                e.jsx("section", {
                    className: "py-20 bg-gradient-to-b from-dark-900 via-dark-800 to-dark-900",
                    children: e.jsxs("div", {
                        className: "container mx-auto px-4 md:px-6",
                        children: [
                            e.jsxs(y.div, {
                                initial: { opacity: 0, y: 30 },
                                animate: { opacity: 1, y: 0 },
                                transition: { duration: 0.6 },
                                className: "text-center max-w-3xl mx-auto mb-16",
                                children: [
                                    e.jsx(H, { className: "h-12 w-12 text-primary-500 mx-auto mb-4" }),
                                    e.jsx("h1", {
                                        className: "font-display font-bold text-4xl md:text-5xl text-white mb-6",
                                        children: "Join the LCM Team"
                                    }),
                                    e.jsx("p", {
                                        className: "text-white/70 text-lg leading-relaxed",
                                        children: "We're building the future of EV charging — and we need passionate, driven people to do it. If you believe in clean energy, bold ideas, and making a real-world impact, this is where you belong."
                                    })
                                ]
                            }),

                            // Perks grid
                            e.jsx(y.div, {
                                initial: { opacity: 0, y: 20 },
                                animate: { opacity: 1, y: 0 },
                                transition: { duration: 0.6, delay: 0.2 },
                                className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20",
                                children: perks.map((perk, i) =>
                                    e.jsxs("div", {
                                        className: "bg-dark-800 border border-white/10 rounded-xl p-6 text-center hover:border-primary-500/30 transition-all duration-300",
                                        children: [
                                            e.jsx("div", { className: "text-4xl mb-3", children: perk.icon }),
                                            e.jsx("h3", {
                                                className: "font-display font-semibold text-white mb-2",
                                                children: perk.title
                                            }),
                                            e.jsx("p", {
                                                className: "text-white/60 text-sm leading-relaxed",
                                                children: perk.description
                                            })
                                        ]
                                    }, i)
                                )
                            }),

                            // Open Roles
                            e.jsxs("div", {
                                children: [
                                    e.jsxs(y.div, {
                                        initial: { opacity: 0, y: 20 },
                                        animate: { opacity: 1, y: 0 },
                                        transition: { duration: 0.5 },
                                        className: "text-center mb-12",
                                        children: [
                                            e.jsx("h2", {
                                                className: "font-display font-bold text-3xl md:text-4xl text-white mb-4",
                                                children: "Open Roles"
                                            }),
                                            e.jsx("p", {
                                                className: "text-white/70 text-lg",
                                                children: "We're growing fast. See if there's a role that's right for you."
                                            })
                                        ]
                                    }),
                                    e.jsx("div", {
                                        className: "space-y-4",
                                        children: jobListings.map((job, i) =>
                                            e.jsx(JobCard, { job, index: i }, i)
                                        )
                                    })
                                ]
                            }),

                            // General application CTA
                            e.jsxs(y.div, {
                                initial: { opacity: 0, y: 20 },
                                animate: { opacity: 1, y: 0 },
                                transition: { duration: 0.5, delay: 0.3 },
                                className: "mt-16 bg-gradient-to-r from-primary-500/20 via-dark-800 to-secondary-500/20 border border-white/10 rounded-2xl p-8 md:p-12 text-center",
                                children: [
                                    e.jsx("h3", {
                                        className: "font-display font-bold text-2xl md:text-3xl text-white mb-4",
                                        children: "Don't see your role?"
                                    }),
                                    e.jsx("p", {
                                        className: "text-white/70 text-lg mb-8 max-w-xl mx-auto",
                                        children: "We're always on the lookout for exceptional talent. Send us your resume and tell us how you can contribute to LCM's mission."
                                    }),
                                    e.jsxs("div", {
                                        className: "flex flex-col sm:flex-row gap-4 justify-center",
                                        children: [
                                            e.jsxs("a", {
                                                href: "mailto:loopchargingmodule@lcmev.com?subject=General Application - LCM",
                                                className: "inline-flex items-center justify-center bg-primary-500 hover:bg-primary-600 text-white px-8 py-3 rounded-full font-medium transition-colors",
                                                children: [
                                                    e.jsx(Ie, { className: "mr-2 h-5 w-5" }),
                                                    "Send General Application"
                                                ]
                                            }),
                                            e.jsxs("a", {
                                                href: "https://www.linkedin.com/company/loop-charging-module-lcm/posts/?feedView=all",
                                                target: "_blank",
                                                rel: "noopener noreferrer",
                                                className: "inline-flex items-center justify-center bg-dark-700 hover:bg-dark-600 border border-white/20 text-white px-8 py-3 rounded-full font-medium transition-colors",
                                                children: [
                                                    e.jsx(z, { className: "mr-2 h-5 w-5" }),
                                                    "Follow us on LinkedIn"
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                })
            ]
        })
    });
};

export { CareersPage as default };
