import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class HtmlTextDto {
  @ApiProperty({
    description: "The HTML content to convert to PDF",
    example: "<html><body><h1>Hello World</h1></body></html>",
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  html: string;
}
