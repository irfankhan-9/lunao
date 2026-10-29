export interface LandingServiceItem {
  id: string;
  name: string;
  price: string;
  duration: string;
  description: string;
}

export interface LandingGuarantee {
  title: string;
  description: string;
}

export const TENANT_LANDING_SERVICES: Record<string, LandingServiceItem[]> = {
  biz_apex_barber: [
    {
      id: 'srv-b1',
      name: 'Signature Cut & Hot Towel Finish',
      price: '$45',
      duration: '45 min',
      description: 'Consultation, precision shear or clipper cut, warm eucalyptus hot towel, and straight-razor neck cleanup.',
    },
    {
      id: 'srv-b2',
      name: 'Beard Sculpt & Contouring',
      price: '$35',
      duration: '30 min',
      description: 'Detailed beard shaping, cheek line taper, mustache trim, conditioning beard butter, and clean razor lines.',
    },
    {
      id: 'srv-b3',
      name: 'Master Haircut & Full Beard Package',
      price: '$70',
      duration: '60 min',
      description: 'Our most requested service combining full precision haircut styling, hot towel ritual, and detailed beard grooming.',
    },
    {
      id: 'srv-b4',
      name: 'Executive Straight-Razor Shave',
      price: '$40',
      duration: '40 min',
      description: 'Traditional multi-step hot lather lathering, steamed towel prep, close straight-razor shave, and cold press finish.',
    },
  ],
  biz_vance_dental: [
    {
      id: 'srv-d1',
      name: 'New Patient Comprehensive Exam & X-Rays',
      price: '$120',
      duration: '60 min',
      description: 'Full digital low-radiation imaging, periodontal screening, oral cancer evaluation, and one-on-one consultation with Dr. Vance.',
    },
    {
      id: 'srv-d2',
      name: 'Routine 6-Month Hygiene Cleaning',
      price: '$95',
      duration: '45 min',
      description: 'Gentle ultrasonic plaque and tartar removal, enamel polishing, and fluoride strengthening treatment.',
    },
    {
      id: 'srv-d3',
      name: 'Professional Teeth Whitening Consultation',
      price: '$75',
      duration: '30 min',
      description: 'Custom shade mapping assessment, sensitivity prevention consultation, and personalized take-home or in-office options.',
    },
    {
      id: 'srv-d4',
      name: 'Restorative Crown & Cosmetic Bonding Consult',
      price: '$110',
      duration: '45 min',
      description: 'Detailed 3D intraoral scan, color matching, and treatment plan review for broken, chipped, or decaying teeth.',
    },
  ],
  biz_vertex_hvac: [
    {
      id: 'srv-h1',
      name: 'Furnace Multi-Point Safety Inspection & Tune-Up',
      price: '$89',
      duration: '60 min',
      description: 'Comprehensive burner safety check, heat exchanger inspection, electrical testing, and carbon monoxide level audit.',
    },
    {
      id: 'srv-h2',
      name: 'Air Conditioning System Diagnostic',
      price: '$89',
      duration: '60 min',
      description: 'Refrigerant pressure verification, capacitor and compressor testing, airflow balance, and filter condition review.',
    },
    {
      id: 'srv-h3',
      name: 'Heat Pump & Ductwork Efficiency Assessment',
      price: '$119',
      duration: '75 min',
      description: 'Full airflow evaluation, static pressure audit, thermostat calibration, and seasonal transition preparation.',
    },
    {
      id: 'srv-h4',
      name: 'Emergency Heating / AC System Diagnostic',
      price: '$129',
      duration: '60 min',
      description: 'Same-day priority inspection when your heating or cooling system is completely non-responsive.',
    },
  ],
  biz_pulse_fitness: [
    {
      id: 'srv-f1',
      name: 'Introductory Small-Group Strength Assessment',
      price: '$35',
      duration: '60 min',
      description: 'Movement screen, baseline strength testing, and introduction to fundamental barbell and mobility exercises.',
    },
    {
      id: 'srv-f2',
      name: '1-on-1 Personalized Movement Consultation',
      price: '$65',
      duration: '50 min',
      description: 'Posture assessment, joint mobility check, and customized training plan design with a certified strength coach.',
    },
    {
      id: 'srv-f3',
      name: 'Conditioning & Barbell Foundations Class',
      price: '$30',
      duration: '60 min',
      description: 'Coached workout focused on progressive overload, cardiovascular conditioning, and supportive community training.',
    },
    {
      id: 'srv-f4',
      name: 'Monthly Studio Membership Consultation',
      price: 'Free',
      duration: '25 min',
      description: 'Studio tour, coach meet-and-greet, class schedule walkthrough, and finding the right training package.',
    },
  ],
};

export const DEFAULT_LANDING_SERVICES: LandingServiceItem[] = [
  {
    id: 'srv-gen-1',
    name: 'Initial Consultation & Assessment',
    price: '$50',
    duration: '45 min',
    description: 'Detailed evaluation of your goals, needs assessment, and clear next steps tailored to your schedule.',
  },
  {
    id: 'srv-gen-2',
    name: 'Standard Comprehensive Service',
    price: '$85',
    duration: '60 min',
    description: 'Our core service performed with high attention to detail and satisfaction guaranteed.',
  },
  {
    id: 'srv-gen-3',
    name: 'Express Check-In & Maintenance',
    price: '$40',
    duration: '30 min',
    description: 'Quick, efficient service designed for busy clients needing prompt care.',
  },
  {
    id: 'srv-gen-4',
    name: 'Premium Complete Care Package',
    price: '$130',
    duration: '90 min',
    description: 'Full comprehensive service including extended consultation and complimentary follow-up.',
  },
];
