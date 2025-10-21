import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, IsUrl } from "class-validator";

export class UrlDto {
  @ApiProperty({
    description:
      "The URL to convert to PDF. If protocol is not provided, https:// will be used.",
    example: "www.example.com",
    required: true,
    examples: {
      withProtocol: {
        value: "https://www.example.com",
        summary: "URL with protocol",
      },
      withoutProtocol: {
        value: "www.example.com",
        summary: "URL without protocol (https:// will be added)",
      },
    },
  })
  @IsString()
  @IsUrl(
    {
      require_protocol: true,
      require_valid_protocol: true,
      protocols: ["http", "https"],
    },
    {
      message: "Please provide a valid URL with http:// or https:// protocol",
    }
  )
  @IsNotEmpty()
  @Transform(({ value }) => {
    if (
      typeof value === "string" &&
      !value.startsWith("http://") &&
      !value.startsWith("https://")
    ) {
      return `https://${value}`;
    }
    return value;
  })
  url: string;
}
