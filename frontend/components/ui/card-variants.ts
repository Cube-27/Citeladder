import { cva } from 'class-variance-authority';

export const cardVariants = cva('bg-panel shadow-card rounded-lg transition-shadow duration-200');

export const cardClasses = () => cardVariants({});
