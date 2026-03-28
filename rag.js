const legalDocs = [
  'Burden of proof lies on prosecution beyond reasonable doubt.',
  'Presence at crime scene alone does not prove guilt.',
  'Circumstantial evidence must form a complete chain.',
  'Benefit of doubt is given to the accused.',
  'Evidence must be reliable and admissible in court.',
]

export function retrieveContext(_query) {
  return legalDocs.join('\n')
}
