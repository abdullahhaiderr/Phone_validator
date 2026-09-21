for (let i = 0; i < processed.length; i += 1000) {
  const rowsToInsert = processed
    .slice(i, i + 1000)
    .map((row) => ({
      ...row,
      upload_id: uploadId,
    }));

  const { error } = await supabase
    .from("phone_results")
    .insert(rowsToInsert);

  if (error) throw new Error(error.message);
}
