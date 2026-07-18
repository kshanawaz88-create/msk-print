import React from "react";
import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Footer from "../components/Footer";
import HowItWorks from "../components/HowItWorks";
import Testimonials from "../components/Testimonials";
import Stats from "../components/Stats";
import FAQ from "../components/FAQ";
import Contact from "../components/Contact";

function Home() {
  return (
    <>
      <Navbar />
      <Hero />
       <HowItWorks />
        <Stats />
       <Testimonials />
       <FAQ />
       <Contact />
      <Footer />
    </>
  );
}

export default Home;