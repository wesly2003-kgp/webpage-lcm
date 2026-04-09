import { j as e, m as y } from "./framer-motion-5UJVrniw.js";
import { a as d } from "./react-vendor-CFxXJm7r.js";
import { L as z, M as O, U as Re, W as et, J as tt, A as st, N as at, C as it, T as rt } from "./main-BkwBQThB.js";

const W = 400,
    nt = 600,
    ot = 320,
    lt = [{
        name: "Wesly Jambarapu",
        role: "CEO & Founder",
        background: "As CEO of LCM, I pioneer breakthrough solution of LCM that enable electric vehicles to charge while in motion",
        image: et,
        social: {
            linkedin: "https://www.linkedin.com/in/wesly-j/",
            email: "wesly.lcm@gmail.com"
        }
    }, {
        name: "Jayshri Bej",
        role: "Co-Founder & CRO",
        background: "As CRO of LCM, I steer project management, ensuring our solutions meet real-world needs and scale effectively",
        image: tt,
        social: {
            linkedin: "https://www.linkedin.com/in/jayshri-bej/",
            email: "jayshribej7@gmail.com"
        }
    }, {
        name: "Anil Kumar",
        role: "Co-Founder & CPO",
        background: "As CPO, I bridge technology and business to create products that redefine industry standards.",
        image: st,
        social: {
            linkedin: "https://www.linkedin.com/in/anilkumar-pidamarthi/",
            email: "anilkumarpidamarthi123@gmail.com"
        }
    }, {
        name: "Naveen Islavath",
        role: "Co-Founder & CFO",
        background: "As CFO, I manage financial operations and drive strategic partnerships to fuel LCM's growth.",
        image: at,
        social: {
            linkedin: "https://www.linkedin.com/in/naveen-islavath-b992021ba",
            email: "naveenssc2019@gmail.com"
        }
    }, {
        name: "Chethan Ashray C",
        role: "COO",
        background: "As COO, I streamline operations at LCM to ensure seamless delivery of innovative EV charging solutions.",
        image: it,
        social: {
            linkedin: "https://www.linkedin.com/in/chethan-ashray-1351b0329",
            email: "chethanashray16@gmail.com"
        }
    }, {
        name: "Mr. Arjun Malhotra",
        role: "Strategic Adviser",
        background: "Co-Founder of HCL, Chairman of Magic Software",
        image: rt,
        social: {
            linkedin: "https://www.linkedin.com/in/arjun-malhotra-5b07005/",
            email: "eloopchargingsolutions@gmail.com"
        }
    }],
    ct = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1, delayChildren: 0.2 }
        }
    },
    dt = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.3 }
        }
    };

const mt = ({ member: t }) => e.jsxs(y.div, {
    variants: dt,
    className: "bg-dark-800 rounded-2xl overflow-hidden border border-white/10 hover:border-primary-500/30 transition-all duration-300 group shadow-lg flex flex-col",
    style: { minHeight: nt, maxWidth: W, width: W, margin: "0 auto" },
    children: [
        e.jsxs("div", {
            className: "w-full",
            style: { height: ot, position: "relative", overflow: "hidden", flexShrink: 0 },
            children: [
                e.jsx("img", {
                    src: t.image,
                    alt: t.name,
                    className: "w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                }),
                e.jsx("div", {
                    className: "absolute inset-0 bg-gradient-to-t from-dark-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                })
            ]
        }),
        e.jsxs("div", {
            className: "flex flex-col flex-grow justify-between p-8",
            children: [
                e.jsxs("div", {
                    children: [
                        e.jsx("h3", { className: "font-display font-semibold text-2xl text-white mb-1", children: t.name }),
                        e.jsx("p", { className: "text-primary-400 mb-2 text-lg", children: t.role }),
                        e.jsx("p", { className: "text-white/70 text-base mb-4", children: t.background })
                    ]
                }),
                e.jsxs("div", {
                    className: "flex space-x-4 mt-auto",
                    children: [
                        t.social.linkedin && e.jsx("a", {
                            href: t.social.linkedin,
                            className: "text-white/60 hover:text-primary-500 transition-colors",
                            "aria-label": `${t.name}'s LinkedIn profile`,
                            target: "_blank",
                            rel: "noopener noreferrer",
                            children: e.jsx(z, { size: 22 })
                        }),
                        t.social.email && e.jsx("a", {
                            href: `mailto:${t.social.email}`,
                            className: "text-white/60 hover:text-primary-500 transition-colors",
                            "aria-label": `Email ${t.name}`,
                            children: e.jsx(O, { size: 22 })
                        })
                    ]
                })
            ]
        })
    ]
});

const TeamPage = () => e.jsx("div", {
    className: "min-h-screen bg-dark-900",
    children: e.jsx("section", {
        className: "py-20",
        children: e.jsxs("div", {
            className: "container mx-auto px-4",
            children: [
                e.jsxs(y.div, {
                    className: "text-center mb-16",
                    initial: { opacity: 0, y: 20 },
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: 0.5, delay: 0.2 },
                    children: [
                        e.jsx(Re, { className: "h-12 w-12 text-primary-500 mx-auto mb-4" }),
                        e.jsx("h2", {
                            className: "font-display font-bold text-3xl md:text-4xl text-white mb-4",
                            children: "Core Team"
                        }),
                        e.jsx("p", {
                            className: "text-white/70 text-lg max-w-2xl mx-auto",
                            children: "Our team brings together expertise from leading automotive companies, research institutions, and technology innovators."
                        })
                    ]
                }),
                e.jsx(y.div, {
                    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12",
                    variants: ct,
                    initial: "hidden",
                    animate: "visible",
                    children: lt.map((t, s) => e.jsx(mt, { member: t }, s))
                })
            ]
        })
    })
});

export { TeamPage as default };
