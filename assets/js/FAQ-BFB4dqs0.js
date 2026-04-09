import { j as e, m as y } from "./framer-motion-5UJVrniw.js";
import { a as d } from "./react-vendor-CFxXJm7r.js";
import { d as Ce, b as Me } from "./main-BkwBQThB.js";

const faqs = [{
    question: "How much power does LCM generate?",
    answer: "LCM typically generates between 1-3 kW of power depending on the vehicle speed and airflow conditions. At highway speeds of 60+ km/h, it reaches optimal performance, providing continuous charging that can significantly extend your EV's range."
}, {
    question: "Does it work on existing EVs?",
    answer: "While LCM is primarily designed for integration into new EV models at the manufacturing stage, we are developing retrofit solutions for select existing EV models. The feasibility depends on the vehicle's hood space and front-end design. Contact us for a specific assessment for your vehicle."
}, {
    question: "What about battery wear and safety?",
    answer: "LCM is designed with battery health as a priority. The system includes advanced power management that delivers smooth, consistent charging current that complies with all battery management system (BMS) protocols. This helps maintain battery health and can actually extend battery lifespan by reducing deep discharge cycles."
}, {
    question: "What happens in dust or rain?",
    answer: "LCM is engineered to automotive-grade specifications for all weather conditions. The system includes protective housing that prevents water ingress and filters that manage dust and debris. Performance remains consistent in rain, and the system is designed to operate across a wide temperature range."
}, {
    question: "Does LCM increase vehicle weight significantly?",
    answer: "No, the entire LCM system typically weighs less than 10kg, which is significantly lighter than alternative range-extension solutions such as additional battery capacity. The weight-to-benefit ratio makes it an extremely efficient addition to any EV."
}, {
    question: "How does LCM affect vehicle aerodynamics?",
    answer: "LCM is designed to have zero additional aerodynamic drag. The system is integrated within the existing hood space and utilizes airflow that is already entering the vehicle's front-end. Extensive wind tunnel testing confirms that vehicles with LCM maintain their original drag coefficient."
}];

const FaqItem = ({ question: t, answer: s, isOpen: a, toggleOpen: n }) =>
    e.jsxs("div", {
        className: "border-b border-white/10 last:border-0",
        children: [
            e.jsxs("button", {
                className: "w-full flex justify-between items-center py-5 text-left focus:outline-none",
                onClick: n,
                children: [
                    e.jsx("h3", { className: "font-display font-medium text-lg text-white", children: t }),
                    a ? e.jsx(Me, { className: "h-5 w-5 text-primary-400 flex-shrink-0" })
                      : e.jsx(Ce, { className: "h-5 w-5 text-white/60 flex-shrink-0" })
                ]
            }),
            e.jsx("div", {
                className: `overflow-hidden transition-all duration-300 ${a ? "max-h-96 opacity-100 pb-5" : "max-h-0 opacity-0"}`,
                children: e.jsx("p", { className: "text-white/70", children: s })
            })
        ]
    });

const FAQPage = () => {
    const [openIndex, setOpenIndex] = d.useState(0);
    const toggle = (i) => setOpenIndex(openIndex === i ? null : i);

    return e.jsx("div", {
        className: "min-h-screen bg-dark-900",
        children: e.jsx("section", {
            id: "faq",
            className: "py-20 bg-gradient-to-b from-dark-800 to-dark-900",
            children: e.jsxs("div", {
                className: "container mx-auto px-4 md:px-6",
                children: [
                    e.jsxs("div", {
                        className: "text-center max-w-3xl mx-auto mb-16",
                        children: [
                            e.jsx("h2", {
                                className: "font-display font-bold text-3xl md:text-4xl text-white mb-4",
                                children: "Frequently Asked Questions"
                            }),
                            e.jsx("p", {
                                className: "text-white/70 text-lg",
                                children: "Get answers to common questions about LCM technology, performance, and integration."
                            })
                        ]
                    }),
                    e.jsxs("div", {
                        className: "grid grid-cols-1 lg:grid-cols-2 gap-12",
                        children: [
                            e.jsx("div", {
                                className: "bg-dark-800 rounded-xl border border-white/10 p-6 overflow-hidden",
                                children: faqs.slice(0, 3).map((faq, i) =>
                                    e.jsx(FaqItem, {
                                        question: faq.question,
                                        answer: faq.answer,
                                        isOpen: openIndex === i,
                                        toggleOpen: () => toggle(i)
                                    }, i)
                                )
                            }),
                            e.jsx("div", {
                                className: "bg-dark-800 rounded-xl border border-white/10 p-6 overflow-hidden",
                                children: faqs.slice(3, 6).map((faq, i) =>
                                    e.jsx(FaqItem, {
                                        question: faq.question,
                                        answer: faq.answer,
                                        isOpen: openIndex === i + 3,
                                        toggleOpen: () => toggle(i + 3)
                                    }, i + 3)
                                )
                            })
                        ]
                    }),
                    e.jsxs("div", {
                        className: "mt-12 text-center",
                        children: [
                            e.jsx("p", { className: "text-white/80 mb-4", children: "Have more questions? We're here to help." }),
                            e.jsx("a", {
                                href: "/#contact",
                                className: "inline-block bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-full font-medium transition-colors",
                                children: "Ask Us Anything"
                            })
                        ]
                    })
                ]
            })
        })
    });
};

export { FAQPage as default };
