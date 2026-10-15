/** Zero-valued legacy tax fields keep stored receipts compatible with the schema.
 * New receipts record the payment itself, without tax or generated invoice IDs.
 */
export function receiptAmounts(amount: number) {
  return {
    supply_type: 'INTRA_STATE' as const,
    place_of_supply: '', place_of_supply_code: '', sac_code: '',
    taxable_amount: amount, total_amount: amount,
    cgst_rate: 0, cgst_amount: 0, sgst_rate: 0, sgst_amount: 0,
    igst_rate: 0, igst_amount: 0, total_tax: 0,
    is_reverse_charge: false, irn: '', ack_no: '', ack_date: '',
  };
}
