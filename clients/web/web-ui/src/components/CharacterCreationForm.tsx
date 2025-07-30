import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Define the character schema
const characterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  race: z.string().min(1, "Race is required"),
  class: z.string().min(1, "Class is required"),
  level: z.number().min(1, "Level must be at least 1").max(20, "Level max is 20"),
});

type CharacterFormData = z.infer<typeof characterSchema>;

export const CharacterCreationForm: React.FC<{ onCreate: (data: CharacterFormData) => void }> = ({ onCreate }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CharacterFormData>({
    resolver: zodResolver(characterSchema),
    defaultValues: { name: "", race: "", class: "", level: 1 },
  });

  const onSubmit = (data: CharacterFormData) => {
    onCreate(data);
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label>
        Name
        <input {...register("name")} />
        {errors.name && <span style={{ color: "red" }}>{errors.name.message}</span>}
      </label>
      <label>
        Race
        <input {...register("race")} />
        {errors.race && <span style={{ color: "red" }}>{errors.race.message}</span>}
      </label>
      <label>
        Class
        <input {...register("class")} />
        {errors.class && <span style={{ color: "red" }}>{errors.class.message}</span>}
      </label>
      <label>
        Level
        <input type="number" {...register("level", { valueAsNumber: true })} min={1} max={20} />
        {errors.level && <span style={{ color: "red" }}>{errors.level.message}</span>}
      </label>
      <button type="submit">Create Character</button>
    </form>
  );
};
